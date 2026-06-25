const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || '';

let cached = global.mongoose;
if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
    if (cached.conn) {
        return cached.conn;
    }
    if (!MONGO_URI) {
        console.warn("MONGO_URI is missing.");
        return;
    }
    
    if (!cached.promise) {
        cached.promise = mongoose.connect(MONGO_URI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        }).then((mongoose) => {
            console.log("MongoDB Connected");
            return mongoose;
        }).catch((err) => {
            console.error("MongoDB Connection Error:", err);
            cached.promise = null;
            throw err;
        });
    }
    
    cached.conn = await cached.promise;
    return cached.conn;
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
