const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { connectDB } = require('./utils/db');

// Import routes
const enrichmentRoutes = require('./routes/enrichment');
const candidatesRoutes = require('./routes/candidates');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'syncup-dev-key';

// Connect to MongoDB
connectDB();

app.use(cors());
app.use(bodyParser.json());

// Serve the static UI dashboard
app.use(express.static(path.join(__dirname, 'public')));

// Middleware: API Key Auth
function requireApiKey(req, res, next) {
    const key = req.headers['x-api-key'];
    if (!key || key !== API_KEY) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or missing API key' });
    }
    next();
}

// Health Check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

// Apply Authentication to API routes
app.use('/api', requireApiKey);

// Mount modular routes
app.use('/api', enrichmentRoutes);
app.use('/api/candidates', candidatesRoutes);

// Export for Vercel Serverless OR Listen for local development
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`SyncUp Server running on http://localhost:${PORT}`);
    });
}

module.exports = app;
