const express = require('express');
const { Candidate } = require('../utils/db');

const router = express.Router();

// GET /api/candidates
router.get('/', async (req, res) => {
    try {
        const candidates = await Candidate.find().sort({ createdAt: -1 });
        res.json({ success: true, count: candidates.length, candidates });
    } catch (err) {
        console.error('[/api/candidates] GET error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Shared URL cleaner
function cleanLinkedinUrl(url) {
    if (!url) return '';
    let clean = url.split('?')[0].replace(/\/+$/, '').toLowerCase();
    const match = clean.match(/linkedin\.com\/in\/([^\/]+)/);
    if (match) {
        return `https://www.linkedin.com/in/${match[1]}`;
    }
    return clean;
}

// GET /api/candidates/check
router.get('/check', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ success: false, error: 'url query parameter is required' });
    
    try {
        const cleanedUrl = cleanLinkedinUrl(url);
        const existing = await Candidate.findOne({ linkedinUrl: cleanedUrl });
        res.json({ success: true, exists: !!existing });
    } catch (err) {
        console.error('[/api/candidates/check] error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/candidates/:id
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const deleted = await Candidate.findByIdAndDelete(id);
        
        if (!deleted) {
            return res.status(404).json({ success: false, error: 'Candidate not found' });
        }
        
        res.json({ success: true, message: 'Candidate deleted' });
    } catch (err) {
        console.error('[/api/candidates] DELETE error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
