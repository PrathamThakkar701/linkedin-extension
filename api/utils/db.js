const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || '';

let isConnected = false;

const connectDB = async () => {
    if (isConnected) return;
    if (!MONGO_URI) {
        console.warn("MONGO_URI is missing. Please set it in your environment variables. Using in-memory fallback is not supported in this version.");
        return;
    }
    try {
        const db = await mongoose.connect(MONGO_URI);
        isConnected = db.connections[0].readyState === 1;
        console.log("MongoDB Connected");
    } catch (err) {
        console.error("MongoDB Connection Error:", err);
    }
};

const candidateSchema = new mongoose.Schema({
    fullName: { type: String, default: '' },
    jobTitle: { type: String, default: '' },
    company: { type: String, default: '' },
    location: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    linkedinUrl: { type: String, unique: true, required: true },
    photoUrl: { type: String, default: '' },
    about: { type: String, default: '' },
    skills: { type: [String], default: [] },
    experience: { type: Array, default: [] },
    education: { type: Array, default: [] },
    source: { type: String, default: 'api' }
}, { timestamps: true });

// Prevent overwrite model error on hot reloads (common in Vercel/NextJS/Nodemon)
const Candidate = mongoose.models.Candidate || mongoose.model('Candidate', candidateSchema);

module.exports = { connectDB, Candidate };
