const express = require('express');
const fetch = require('node-fetch');
const { Candidate } = require('../utils/db');
const { fetchContactFromApollo } = require('../services/contactFetcher');

const router = express.Router();
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '';
const APOLLO_API_KEY = process.env.APOLLO_API_KEY || '';
const SERP_API_KEY = process.env.SERP_API_KEY || '';

// Shared normalizer
function normalizeCandidate(raw, source = 'api') {
    return {
        fullName:    raw.name        || raw.full_name        || '',
        jobTitle:    raw.headline    || raw.occupation        || '',
        company:     raw.currentCompany || (raw.experiences && raw.experiences[0] ? raw.experiences[0].company : '') || '',
        location:    raw.location    || raw.city             || '',
        email:       raw.email       || raw.personal_email   || '',
        phone:       raw.phone       || raw.personal_numbers?.[0] || '',
        linkedinUrl: raw.linkedinUrl || raw.public_identifier
            ? `https://www.linkedin.com/in/${raw.public_identifier}`
            : '',
        photoUrl:    raw.photoUrl    || raw.profile_pic_url  || '',
        skills:      raw.skills      || (raw.skills_v2 ? raw.skills_v2.map(s => s.name) : []),
        experience:  raw.experience  || raw.experiences      || [],
        education:   raw.education   || raw.education_v2     || [],
        source
    };
}

// Option 1: Find LinkedIn URL from Name + Company
router.post('/find', async (req, res) => {
    const { name, company } = req.body;

    if (!name) return res.status(400).json({ success: false, error: '"name" is required' });
    if (!SERP_API_KEY) return res.status(503).json({ success: false, error: 'SERP_API_KEY is not configured.' });

    const query = company ? `site:linkedin.com/in/ "${name}" "${company}"` : `site:linkedin.com/in/ "${name}"`;

    try {
        const serpUrl = new URL('https://serpapi.com/search.json');
        serpUrl.searchParams.set('q', query);
        serpUrl.searchParams.set('api_key', SERP_API_KEY);
        serpUrl.searchParams.set('num', '5');
        serpUrl.searchParams.set('engine', 'google');

        const serpRes = await fetch(serpUrl.toString());
        if (!serpRes.ok) throw new Error(`SerpAPI error: ${await serpRes.text()}`);

        const serpData = await serpRes.json();
        const match = (serpData.organic_results || []).find(r => r.link && r.link.includes('linkedin.com/in/'));

        if (!match) return res.status(404).json({ success: false, error: 'No profile found', query });

        return res.json({ success: true, linkedinUrl: match.link.split('?')[0].replace(/\/$/, '') });
    } catch (err) {
        console.error('[/api/find] error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// Option 2/3: RapidAPI URL Enrichment
router.post('/enrich-url', async (req, res) => {
    const { linkedinUrl } = req.body;

    if (!linkedinUrl || !linkedinUrl.includes('linkedin.com/in/')) {
        return res.status(400).json({ success: false, error: 'A valid linkedinUrl is required' });
    }
    if (!RAPIDAPI_KEY) {
        return res.status(503).json({ success: false, error: 'RAPIDAPI_KEY is not configured.' });
    }

    try {
        const rapidUrl = `https://fresh-linkedin-profile-data.p.rapidapi.com/get-linkedin-profile?linkedin_url=${encodeURIComponent(linkedinUrl)}`;
        
        const rapidRes = await fetch(rapidUrl, {
            headers: { 
                'X-RapidAPI-Key': RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'fresh-linkedin-profile-data.p.rapidapi.com'
            }
        });

        if (rapidRes.status === 404) {
            return res.status(404).json({ success: false, error: 'Profile not found on RapidAPI.' });
        }
        if (!rapidRes.ok) {
            const errText = await rapidRes.text();
            return res.status(502).json({ success: false, error: `RapidAPI error (${rapidRes.status}): ${errText}` });
        }

        const rawData = await rapidRes.json();
        
        // Fresh LinkedIn API usually puts data inside a `data` object, or at the root depending on success structure
        const raw = rawData.data || rawData;
        
        if (rawData.message && rawData.message.includes('not subscribed')) {
            return res.status(403).json({ success: false, error: 'RapidAPI Subscription Required. Please subscribe to Fresh LinkedIn Profile Data on RapidAPI.' });
        }

        raw.linkedinUrl = linkedinUrl;

        const normalized = normalizeCandidate(raw, 'rapidapi');
        normalized.linkedinUrl = linkedinUrl;

        // Upsert MongoDB
        const updatedCandidate = await Candidate.findOneAndUpdate(
            { linkedinUrl: normalized.linkedinUrl },
            { $set: normalized },
            { new: true, upsert: true }
        );

        return res.status(200).json({
            success: true,
            message: 'Candidate updated with RapidAPI data',
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
    normalized.linkedinUrl = profile.linkedinUrl;

    try {
        const updatedCandidate = await Candidate.findOneAndUpdate(
            { linkedinUrl: normalized.linkedinUrl },
            { $set: normalized },
            { new: true, upsert: true }
        );

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
    if (!APOLLO_API_KEY) {
        return res.status(503).json({ success: false, error: 'APOLLO_API_KEY is not configured.' });
    }

    try {
        const contactInfo = await fetchContactFromApollo(name, company, APOLLO_API_KEY);
        
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
