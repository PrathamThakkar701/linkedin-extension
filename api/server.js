const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'syncup-dev-key';
const DB_PATH = path.join(__dirname, 'database.json');

app.use(cors());
app.use(bodyParser.json());

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

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/enrich', requireApiKey, (req, res) => {
    const profile = req.body;

    // Validation
    if (!profile.linkedinUrl) {
        return res.status(400).json({ success: false, error: 'linkedinUrl is required' });
    }

    const db = getDatabase();

    const existingIndex = db.candidates.findIndex(c => c.linkedinUrl === profile.linkedinUrl);

    if (existingIndex !== -1) {
        // Update existing candidate
        const existingCandidate = db.candidates[existingIndex];
        const updatedCandidate = {
            ...existingCandidate,
            fullName: profile.name || existingCandidate.fullName,
            jobTitle: profile.headline || existingCandidate.jobTitle,
            company: profile.currentCompany || existingCandidate.company,
            location: profile.location || existingCandidate.location,
            email: profile.email || existingCandidate.email,
            phone: profile.phone || existingCandidate.phone,
            photoUrl: profile.photoUrl || existingCandidate.photoUrl,
            skills: profile.skills && profile.skills.length > 0 ? profile.skills : existingCandidate.skills,
            experience: profile.experience && profile.experience.length > 0 ? profile.experience : existingCandidate.experience,
            education: profile.education && profile.education.length > 0 ? profile.education : existingCandidate.education,
            updatedAt: new Date().toISOString()
        };
        
        db.candidates[existingIndex] = updatedCandidate;
        saveDatabase(db);

        return res.status(200).json({
            success: true,
            message: 'Candidate updated in local database',
            candidateId: updatedCandidate.id,
            candidate: updatedCandidate
        });
    }

    // Prepare Candidate Object for new insert
    const newCandidate = {
        id: `cand_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        fullName: profile.name || '',
        jobTitle: profile.headline || '',
        company: profile.currentCompany || '',
        location: profile.location || '',
        email: profile.email || '',
        phone: profile.phone || '',
        linkedinUrl: profile.linkedinUrl,
        photoUrl: profile.photoUrl || '',
        skills: profile.skills || [],
        experience: profile.experience || [],
        education: profile.education || [],
        source: 'linkedin-extension',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    db.candidates.push(newCandidate);
    saveDatabase(db);

    res.status(201).json({
        success: true,
        message: 'Candidate saved to local database',
        candidateId: newCandidate.id,
        candidate: newCandidate
    });
});

app.get('/api/candidates', requireApiKey, (req, res) => {
    const db = getDatabase();
    res.json({ success: true, count: db.candidates.length, candidates: db.candidates });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Using API Key: ${API_KEY}`);
});
