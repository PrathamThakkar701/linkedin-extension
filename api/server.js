const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'syncup-dev-key';
const DB_PATH = path.join(__dirname, 'database.json');

// Third-party API keys (set via environment variables / Vercel dashboard)
const SERP_API_KEY = process.env.SERP_API_KEY || '';
const PROXYCURL_API_KEY = process.env.PROXYCURL_API_KEY || '';

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Local JSON DB
if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ candidates: [] }, null, 2));
}

function getDatabase() {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
}

function saveDatabase(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Middleware: API Key Auth
function requireApiKey(req, res, next) {
    const key = req.headers['x-api-key'];
    if (!key || key !== API_KEY) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or missing API key' });
    }
    next();
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Normalize raw profile data (from Proxycurl or Chrome extension) into our
 * canonical candidate schema. Only maps fields that are present in the source.
 */
function normalizeCandidate(raw, source = 'api') {
    return {
        id: `cand_${Date.now()}_${Math.random().toString(36).substring(7)}`,
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
        source,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

/**
 * Upsert a candidate into the local DB by linkedinUrl.
 * Returns { candidate, isNew } where isNew indicates a new record was created.
 */
function upsertCandidate(normalizedCandidate) {
    const db = getDatabase();
    const existingIndex = db.candidates.findIndex(
        c => c.linkedinUrl === normalizedCandidate.linkedinUrl
    );

    if (existingIndex !== -1) {
        const existing = db.candidates[existingIndex];
        // Merge: only overwrite fields that are empty in the existing record
        const merged = {
            ...existing,
            fullName:  normalizedCandidate.fullName  || existing.fullName,
            jobTitle:  normalizedCandidate.jobTitle  || existing.jobTitle,
            company:   normalizedCandidate.company   || existing.company,
            location:  normalizedCandidate.location  || existing.location,
            email:     normalizedCandidate.email     || existing.email,
            phone:     normalizedCandidate.phone     || existing.phone,
            photoUrl:  normalizedCandidate.photoUrl  || existing.photoUrl,
            skills:    normalizedCandidate.skills?.length    ? normalizedCandidate.skills    : existing.skills,
            experience:normalizedCandidate.experience?.length? normalizedCandidate.experience: existing.experience,
            education: normalizedCandidate.education?.length ? normalizedCandidate.education : existing.education,
            updatedAt: new Date().toISOString(),
        };
        db.candidates[existingIndex] = merged;
        saveDatabase(db);
        return { candidate: merged, isNew: false };
    }

    db.candidates.push(normalizedCandidate);
    saveDatabase(db);
    return { candidate: normalizedCandidate, isNew: true };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        config: {
            serpApiConfigured:     !!SERP_API_KEY,
            proxycurlConfigured:   !!PROXYCURL_API_KEY,
        }
    });
});

// ---------------------------------------------------------------------------
// POST /api/find
// Condition (ii): unstructured input (Name + Company)
// Uses SerpAPI to run: site:linkedin.com/in/ "Name" "Company"
// Returns the best-matching LinkedIn profile URL.
// ---------------------------------------------------------------------------
app.post('/api/find', requireApiKey, async (req, res) => {
    const { name, company } = req.body;

    if (!name) {
        return res.status(400).json({ success: false, error: '"name" is required' });
    }
    if (!SERP_API_KEY) {
        return res.status(503).json({
            success: false,
            error: 'SERP_API_KEY is not configured. Set it as an environment variable.'
        });
    }

    // Build the Google search query that targets LinkedIn profile pages
    const query = company
        ? `site:linkedin.com/in/ "${name}" "${company}"`
        : `site:linkedin.com/in/ "${name}"`;

    try {
        const serpUrl = new URL('https://serpapi.com/search.json');
        serpUrl.searchParams.set('q', query);
        serpUrl.searchParams.set('api_key', SERP_API_KEY);
        serpUrl.searchParams.set('num', '5');  // grab top 5 results
        serpUrl.searchParams.set('engine', 'google');

        const serpRes = await fetch(serpUrl.toString());
        if (!serpRes.ok) {
            const errText = await serpRes.text();
            return res.status(502).json({ success: false, error: `SerpAPI error: ${errText}` });
        }

        const serpData = await serpRes.json();
        const organicResults = serpData.organic_results || [];

        // Extract the first result that is a valid /in/ profile URL
        const match = organicResults.find(r =>
            r.link && r.link.includes('linkedin.com/in/')
        );

        if (!match) {
            return res.status(404).json({
                success: false,
                error: 'No LinkedIn profile found for the given name and company.',
                query
            });
        }

        // Clean the URL — strip query params and trailing slashes
        const linkedinUrl = match.link.split('?')[0].replace(/\/$/, '');

        return res.json({
            success: true,
            linkedinUrl,
            title: match.title || '',
            snippet: match.snippet || '',
            query
        });

    } catch (err) {
        console.error('[/api/find] error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ---------------------------------------------------------------------------
// POST /api/enrich-url
// Condition (i) and continuation of (ii): given a LinkedIn URL, call
// Proxycurl to get the full structured profile, normalize it, and save.
// ---------------------------------------------------------------------------
app.post('/api/enrich-url', requireApiKey, async (req, res) => {
    const { linkedinUrl } = req.body;

    if (!linkedinUrl || !linkedinUrl.includes('linkedin.com/in/')) {
        return res.status(400).json({
            success: false,
            error: 'A valid linkedinUrl (linkedin.com/in/...) is required'
        });
    }
    if (!PROXYCURL_API_KEY) {
        return res.status(503).json({
            success: false,
            error: 'PROXYCURL_API_KEY is not configured. Set it as an environment variable.'
        });
    }

    try {
        // Call Proxycurl Person Profile Endpoint
        const proxycurlUrl = new URL('https://nubela.co/proxycurl/api/v2/linkedin');
        proxycurlUrl.searchParams.set('url', linkedinUrl);
        proxycurlUrl.searchParams.set('extra', 'include');          // extra fields
        proxycurlUrl.searchParams.set('skills', 'include');         // skills list
        proxycurlUrl.searchParams.set('use_cache', 'if-present');   // save API credits

        const pcRes = await fetch(proxycurlUrl.toString(), {
            headers: { 'Authorization': `Bearer ${PROXYCURL_API_KEY}` }
        });

        if (pcRes.status === 404) {
            return res.status(404).json({ success: false, error: 'Profile not found on Proxycurl.' });
        }
        if (!pcRes.ok) {
            const errText = await pcRes.text();
            return res.status(502).json({ success: false, error: `Proxycurl error (${pcRes.status}): ${errText}` });
        }

        const raw = await pcRes.json();

        // Proxycurl returns public_identifier (the slug), not a full URL
        if (!raw.public_identifier) {
            raw.public_identifier = linkedinUrl.match(/linkedin\.com\/in\/([^/?]+)/)?.[1] || '';
        }
        // Ensure linkedinUrl is set on raw for normalizer
        raw.linkedinUrl = linkedinUrl;
        // Proxycurl uses 'full_name' not 'name'
        raw.name = raw.full_name || '';

        const normalized = normalizeCandidate(raw, 'proxycurl');
        normalized.linkedinUrl = linkedinUrl; // guarantee the URL is correct

        const { candidate, isNew } = upsertCandidate(normalized);

        return res.status(isNew ? 201 : 200).json({
            success: true,
            message: isNew ? 'Candidate created from Proxycurl data' : 'Candidate updated with Proxycurl data',
            candidateId: candidate.id,
            candidate,
        });

    } catch (err) {
        console.error('[/api/enrich-url] error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ---------------------------------------------------------------------------
// POST /api/enrich
// Condition (iii): data posted directly by the Chrome extension
// ---------------------------------------------------------------------------
app.post('/api/enrich', requireApiKey, (req, res) => {
    const profile = req.body;

    if (!profile.linkedinUrl) {
        return res.status(400).json({ success: false, error: 'linkedinUrl is required' });
    }

    const normalized = normalizeCandidate(profile, 'linkedin-extension');
    normalized.linkedinUrl = profile.linkedinUrl; // preserve exactly as sent

    const { candidate, isNew } = upsertCandidate(normalized);

    return res.status(isNew ? 201 : 200).json({
        success: true,
        message: isNew ? 'Candidate saved to local database' : 'Candidate updated in local database',
        candidateId: candidate.id,
        candidate,
    });
});

// ---------------------------------------------------------------------------
// GET /api/candidates
// ---------------------------------------------------------------------------
app.get('/api/candidates', requireApiKey, (req, res) => {
    const db = getDatabase();
    res.json({ success: true, count: db.candidates.length, candidates: db.candidates });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`API Key configured: ${!!API_KEY}`);
    console.log(`SerpAPI configured: ${!!SERP_API_KEY}`);
    console.log(`Proxycurl configured: ${!!PROXYCURL_API_KEY}`);
});
