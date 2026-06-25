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
// Export/Webhook endpoint to send data to external URL
router.post('/export', async (req, res) => {
    try {
        const { webhookUrl, candidateId } = req.body;
        if (!webhookUrl) {
            return res.status(400).json({ success: false, error: 'webhookUrl is required' });
        }

        let dataToSend;
        if (candidateId) {
            dataToSend = await Candidate.findById(candidateId).lean();
            if (!dataToSend) return res.status(404).json({ success: false, error: 'Candidate not found' });
        } else {
            dataToSend = await Candidate.find().sort({ createdAt: -1 }).lean();
        }

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataToSend)
        });

        if (!response.ok) {
            throw new Error(`External server returned ${response.status}`);
        }

        return res.status(200).json({ success: true, message: 'Data successfully exported' });
    } catch (err) {
        console.error('Export Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
