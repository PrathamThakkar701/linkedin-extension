require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/syncup';

const candidateSchema = new mongoose.Schema({
    fullName: { type: String, default: '' },
    jobTitle: { type: String, default: '' },
    company: { type: String, default: '' },
    location: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    linkedinUrl: { type: String, required: true },
    photoUrl: { type: String, default: '' },
    skills: { type: [String], default: [] },
    experience: { type: Array, default: [] },
    education: { type: Array, default: [] },
    source: { type: String, default: 'api' }
}, { timestamps: true });

const Candidate = mongoose.models.Candidate || mongoose.model('Candidate', candidateSchema);

function cleanLinkedinUrl(url) {
    if (!url) return '';
    let clean = url.split('?')[0].replace(/\/+$/, '').toLowerCase();
    const match = clean.match(/linkedin\.com\/in\/([^\/]+)/);
    if (match) {
        return `https://www.linkedin.com/in/${match[1]}`;
    }
    return clean;
}

async function migrate() {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("Connected.");
    
    const allCandidates = await Candidate.find().lean();
    console.log(`Found ${allCandidates.length} candidates.`);
    
    const grouped = {};
    for (const cand of allCandidates) {
        const cleaned = cleanLinkedinUrl(cand.linkedinUrl);
        if (!grouped[cleaned]) grouped[cleaned] = [];
        grouped[cleaned].push(cand);
    }
    
    for (const [cleanedUrl, docs] of Object.entries(grouped)) {
        if (docs.length > 1) {
            console.log(`Found ${docs.length} duplicates for ${cleanedUrl}`);
            
            docs.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
            const master = docs[0];
            const others = docs.slice(1);
            
            let mergedData = { ...master, linkedinUrl: cleanedUrl };
            
            for (const other of others) {
                mergedData.fullName = mergedData.fullName || other.fullName;
                mergedData.jobTitle = mergedData.jobTitle || other.jobTitle;
                mergedData.company = mergedData.company || other.company;
                mergedData.location = mergedData.location || other.location;
                mergedData.email = mergedData.email || other.email;
                mergedData.phone = mergedData.phone || other.phone;
                mergedData.photoUrl = mergedData.photoUrl || other.photoUrl;
                
                console.log(`Deleting duplicate ID: ${other._id}`);
                await Candidate.findByIdAndDelete(other._id);
            }
            
            console.log(`Updating master ID: ${master._id} with cleaned URL`);
            delete mergedData._id;
            await Candidate.findByIdAndUpdate(master._id, { $set: mergedData });
            
        } else {
            const doc = docs[0];
            if (doc.linkedinUrl !== cleanedUrl) {
                console.log(`Updating URL for ${doc._id} from ${doc.linkedinUrl} to ${cleanedUrl}`);
                await Candidate.findByIdAndUpdate(doc._id, { $set: { linkedinUrl: cleanedUrl } });
            }
        }
    }
    
    console.log("Migration complete.");
    process.exit(0);
}

migrate().catch(console.error);
