const express = require('express');
const fetch = require('node-fetch');
const { Candidate } = require('../utils/db');
const { fetchContactFromSnov, fetchContactFromHunter } = require('../services/contactFetcher');

const router = express.Router();
const SNOV_CLIENT_ID = process.env.SNOV_CLIENT_ID || '';
const SNOV_CLIENT_SECRET = process.env.SNOV_CLIENT_SECRET || '';
const HUNTER_API_KEY = process.env.HUNTER_API_KEY || '';
const SERP_API_KEY = process.env.SERP_API_KEY || '';

// Shared URL cleaner to ensure deduplication works perfectly
function cleanLinkedinUrl(url) {
    if (!url) return '';
    let clean = url.split('?')[0].replace(/\/+$/, '').toLowerCase();
    const match = clean.match(/linkedin\.com\/in\/([^\/]+)/);
    if (match) {
        return `https://www.linkedin.com/in/${match[1]}`;
    }
    return clean;
}

// Shared normalizer
function normalizeCandidate(raw, source = 'api') {
    let linkedinUrl = raw.linkedinUrl || (raw.public_identifier ? `https://www.linkedin.com/in/${raw.public_identifier}` : '');
    
    // PDL & Extension formatting logic
    let fullName = raw.name || raw.full_name || (raw.first_name ? `${raw.first_name} ${raw.last_name || ''}`.trim() : '');
    let jobTitle = raw.headline || raw.occupation || raw.job_title || '';
    
    // Extract company safely (PDL might return company as an object)
    let company = raw.currentCompany || raw.job_company_name || '';
    if (typeof company === 'object' && company !== null) {
        company = company.name || '';
    }

    // Process Experience Array
    let rawExp = raw.experience || raw.experiences || [];
    let expArray = [];
    if (Array.isArray(rawExp)) {
        expArray = rawExp.map(e => {
            // PDL objects vs Extension scrape strings
            return {
                title: (typeof e.title === 'object' ? e.title?.name : e.title) || '',
                company: (typeof e.company === 'object' ? e.company?.name : e.company) || '',
                duration: e.duration || (e.start_date ? `${e.start_date} - ${e.end_date || 'Present'}` : ''),
                details: e.details || ''
            };
        });
    }

    if (!company || company === 'Unknown Company') {
        if (expArray.length > 0) {
            const presentExp = expArray.find(e => e.duration && e.duration.toLowerCase().includes('present'));
            if (presentExp) {
                company = presentExp.company;
            } else {
                company = expArray[0].company;
            }
            // Strip out generic text like "Full-time" or "Part-time" from company name from extension scrape
            if (typeof company === 'string' && company.includes(' · ')) {
                company = company.split(' · ')[0];
            }
        }
    }

    // Extract Location (PDL returns location as an object, extension returns string)
    let location = raw.location || raw.city || raw.location_name || '';
    if (typeof location === 'object' && location !== null) {
        location = location.name || location.locality || location.country || '';
    } else if (typeof location !== 'string') {
        location = raw.location_name || raw.city || '';
    }
    location = String(location).trim();
    if (location.toLowerCase() === 'true') {
        location = '';
    }

    let email = raw.email || raw.personal_email || (raw.emails && raw.emails.length > 0 ? (typeof raw.emails[0] === 'string' ? raw.emails[0] : raw.emails[0].address) : '');
    let phone = raw.phone || raw.personal_numbers?.[0] || (raw.phone_numbers && raw.phone_numbers.length > 0 ? raw.phone_numbers[0] : '');

    return {
        fullName:    fullName,
        jobTitle:    jobTitle,
        company:     company,
        location:    location,
        email:       email,
        phone:       phone,
        linkedinUrl: cleanLinkedinUrl(linkedinUrl),
        photoUrl:    raw.photoUrl    || raw.profile_pic_url  || '',
        about:       raw.about       || raw.summary          || '',
        skills:      raw.skills      || (raw.skills_v2 ? raw.skills_v2.map(s => s.name) : []),
        experience:  expArray,
        education:   raw.education   || raw.education_v2     || [],
        source
    };
}

// Option 1: Find LinkedIn URL from Name + Company
router.post('/find', async (req, res) => {
    const { name, company } = req.body;

    if (!name) return res.status(400).json({ success: false, error: '"name" is required' });
    if (!SERP_API_KEY) return res.status(503).json({ success: false, error: 'SERP_API_KEY is not configured.' });

    const query = company ? `site:linkedin.com/in/ (intitle:"${name}" ${company}) OR intitle:"${name}"` : `site:linkedin.com/in/ intitle:"${name}"`;

    try {
        const serpUrl = new URL('https://serpapi.com/search.json');
        serpUrl.searchParams.set('q', query);
        serpUrl.searchParams.set('api_key', SERP_API_KEY);
        serpUrl.searchParams.set('num', '10');
        serpUrl.searchParams.set('engine', 'google');

        const serpRes = await fetch(serpUrl.toString());
        if (!serpRes.ok) throw new Error(`SerpAPI error: ${await serpRes.text()}`);

        const serpData = await serpRes.json();
        
        // Find all organic results that are valid LinkedIn profiles
        const matches = (serpData.organic_results || [])
            .filter(r => r.link && r.link.includes('linkedin.com/in/'))
            .map(m => ({
                title: m.title || 'LinkedIn Profile',
                snippet: m.snippet || 'No description available.',
                thumbnail: m.thumbnail || m.image || '',
                linkedinUrl: m.link.split('?')[0].replace(/\/$/, '')
            }));

        if (matches.length === 0) return res.status(404).json({ success: false, error: 'No profiles found for this query', query });

        // Deduplicate by URL just in case Google returns the same profile twice with slightly different parameters
        const uniqueMatches = [];
        const seenUrls = new Set();
        for (const m of matches) {
            if (!seenUrls.has(m.linkedinUrl)) {
                seenUrls.add(m.linkedinUrl);
                uniqueMatches.push(m);
            }
        }

        return res.json({ success: true, results: uniqueMatches });
    } catch (err) {
        console.error('[/api/find] error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// Intelligent Merge Helper
async function intelligentUpsert(normalized) {
    const existing = await Candidate.findOne({ linkedinUrl: normalized.linkedinUrl }).lean();

    let mergedData = { ...normalized };
    
    // If data comes from PDL/API, strip out bulk arrays we don't want
    if (normalized.source === 'pdl' || normalized.source === 'api') {
        mergedData.education = [];
        mergedData.skills = [];
        mergedData.experience = [];
    }

    if (existing) {
        if (normalized.source === 'pdl' || normalized.source === 'api') {
            // Only take information from PDL that we DON'T have
            mergedData = {
                ...existing,
                fullName: existing.fullName || normalized.fullName,
                jobTitle: existing.jobTitle || normalized.jobTitle,
                company: existing.company || normalized.company,
                location: existing.location || normalized.location,
                email: existing.email || normalized.email,
                phone: existing.phone || normalized.phone,
                photoUrl: existing.photoUrl || normalized.photoUrl,
                about: existing.about || normalized.about
            };
        } else {
            // If it's an extension scrape, update our records but keep existing contact info if missing
            mergedData = {
                ...existing,
                ...normalized,
                email: normalized.email || existing.email,
                phone: normalized.phone || existing.phone,
                about: normalized.about || existing.about,
                experience: normalized.experience.length > 0 ? normalized.experience : existing.experience,
                education: normalized.education.length > 0 ? normalized.education : existing.education,
                skills: normalized.skills.length > 0 ? normalized.skills : existing.skills
            };
        }
    }

    delete mergedData._id; // Ensure _id is not in $set
    delete mergedData.__v;

    return await Candidate.findOneAndUpdate(
        { linkedinUrl: normalized.linkedinUrl },
        { $set: mergedData },
        { returnDocument: 'after', upsert: true }
    );
}

// Option 2/3: PDL URL Enrichment
router.post('/enrich-url', async (req, res) => {
    let { linkedinUrl, fallbackData } = req.body;

    if (!linkedinUrl || !linkedinUrl.includes('linkedin.com/in/')) {
        return res.status(400).json({ success: false, error: 'A valid linkedinUrl is required' });
    }
    linkedinUrl = cleanLinkedinUrl(linkedinUrl);
    
    if (!process.env.PDL_API_KEY) {
        return res.status(503).json({ success: false, error: 'PDL_API_KEY is not configured.' });
    }

    try {
        const pdlRes = await fetch(`https://api.peopledatalabs.com/v5/person/enrich?profile=${encodeURIComponent(linkedinUrl)}`, {
            headers: { 'X-Api-Key': process.env.PDL_API_KEY }
        });

        if (pdlRes.status === 404) {
            if (fallbackData) {
                const skeleton = {
                    linkedinUrl,
                    fullName: fallbackData.name || 'Unknown Candidate',
                    jobTitle: fallbackData.headline || '',
                    photoUrl: fallbackData.thumbnail || '',
                    company: 'Unknown Company',
                    location: 'Unknown Location',
                    source: 'fallback',
                    experience: [],
                    skills: [],
                    education: []
                };
                const updatedCandidate = await intelligentUpsert(skeleton);
                return res.status(200).json({
                    success: true,
                    message: 'Saved skeleton profile (PDL returned 404)',
                    candidate: updatedCandidate,
                    fallback: true
                });
            }
            return res.status(404).json({ success: false, error: 'Profile not found on PDL.' });
        }
        if (!pdlRes.ok) {
            const errText = await pdlRes.text();
            return res.status(502).json({ success: false, error: `PDL error (${pdlRes.status}): ${errText}` });
        }

        const rawData = await pdlRes.json();
        const pdlData = rawData.data || rawData;
        
        const normalized = normalizeCandidate(pdlData, 'pdl');
        normalized.linkedinUrl = linkedinUrl;

        if (fallbackData) {
            if (!normalized.photoUrl && fallbackData.thumbnail) {
                normalized.photoUrl = fallbackData.thumbnail;
            }
            if (!normalized.fullName && fallbackData.name) {
                normalized.fullName = fallbackData.name;
            }
        }

        // Upsert MongoDB using intelligent merge
        const updatedCandidate = await intelligentUpsert(normalized);

        return res.status(200).json({
            success: true,
            message: 'Candidate updated with PDL data',
            candidate: updatedCandidate,
        });

    } catch (err) {
        console.error('[/api/enrich-url] error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// Original Extension Data Dump Enrichment
router.post('/enrich', async (req, res) => {
    const profile = req.body;

    if (!profile.linkedinUrl) {
        return res.status(400).json({ success: false, error: 'linkedinUrl is required' });
    }

    const normalized = normalizeCandidate(profile, 'linkedin-extension');
    normalized.linkedinUrl = cleanLinkedinUrl(profile.linkedinUrl);

    try {
        const updatedCandidate = await intelligentUpsert(normalized);

        return res.status(200).json({
            success: true,
            message: 'Candidate saved to MongoDB',
            candidate: updatedCandidate,
        });
    } catch (err) {
        console.error('[/api/enrich] error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// New Contact Fetcher
router.post('/fetch-contact', async (req, res) => {
    const { id, name, company } = req.body;

    if (!name || !company) {
        return res.status(400).json({ success: false, error: 'Name and company are required to fetch contacts.' });
    }
    if (!HUNTER_API_KEY) {
        return res.status(503).json({ success: false, error: 'Hunter.io API key is not configured.' });
    }

    try {
        let contactInfo;
        try {
            contactInfo = await fetchContactFromHunter(name, company, HUNTER_API_KEY, SERP_API_KEY);
        } catch (hunterErr) {
            if (hunterErr.message === 'HUNTER_LIMIT_REACHED') {
                console.log(`[SyncUp] Hunter limit reached. Falling back to Snov.io for ${name}...`);
                if (!process.env.SNOV_CLIENT_ID || !process.env.SNOV_CLIENT_SECRET) {
                    throw new Error('Hunter limits reached, but Snov.io credentials are not configured for fallback.');
                }
                contactInfo = await fetchContactFromSnov(name, company, process.env.SNOV_CLIENT_ID, process.env.SNOV_CLIENT_SECRET, SERP_API_KEY);
            } else {
                throw hunterErr; // throw other Hunter errors (e.g. invalid key)
            }
        }
        
        // If an ID was provided, automatically update the record in the database
        if (id && (contactInfo.email || contactInfo.phone)) {
            await Candidate.findByIdAndUpdate(id, { 
                $set: { 
                    ...(contactInfo.email && { email: contactInfo.email }),
                    ...(contactInfo.phone && { phone: contactInfo.phone })
                } 
            });
        }

        return res.status(200).json({
            success: true,
            contact: contactInfo
        });

    } catch (err) {
        console.error('[/api/fetch-contact] error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
