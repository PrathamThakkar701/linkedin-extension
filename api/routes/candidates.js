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
