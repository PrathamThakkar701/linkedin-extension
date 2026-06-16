const pptxgen = require('pptxgenjs');
const path = require('path');

let pres = new pptxgen();
pres.layout = 'LAYOUT_16x9';

// Define a clean master slide with NO "SyncUp" text
pres.defineSlideMaster({
  title: 'MASTER_SLIDE',
  background: { color: 'FFFFFF' },
  objects: [
    { rect: { x: 0, y: 0, w: '100%', h: 0.8, fill: { color: '003366' } } }
  ]
});

// Slide 1: Title
let slide1 = pres.addSlide();
slide1.addText('[Project Title Placeholder]', { x: '10%', y: '30%', w: '80%', fontSize: 44, bold: true, align: 'center', color: '003366' });
slide1.addText('[Team Name Placeholder]', { x: '10%', y: '50%', w: '80%', fontSize: 24, align: 'center', color: '333333' });
slide1.addText('Team Members:\n[Member 1 Placeholder]\n[Member 2 Placeholder]\nAbhinav Bangar', { x: '10%', y: '65%', w: '80%', fontSize: 18, align: 'center', color: '666666' });

// Slide 2: Background & Problem Statement
let slide2 = pres.addSlide({ masterName: 'MASTER_SLIDE' });
slide2.addText('Background & Problem Statement', { x: 0.5, y: 0.1, w: '90%', h: 0.6, fontSize: 24, color: 'FFFFFF', bold: true });
slide2.addText([
  { text: 'Manual Data Entry is Inefficient\n', options: { bold: true, fontSize: 18, color: '003366' } },
  { text: 'Recruiters and HR teams currently spend hours manually copying candidate details (names, locations, experiences) from LinkedIn into their CRM systems.\n\n', options: { fontSize: 14 } },
  { text: 'Platform Restrictions & Obfuscation\n', options: { bold: true, fontSize: 18, color: '003366' } },
  { text: 'LinkedIn actively discourages scraping by utilizing heavily obfuscated DOM structures (randomized class names) and strict rate limits, making traditional web scrapers obsolete.\n\n', options: { fontSize: 14 } },
  { text: 'The Need for an Integrated Solution\n', options: { bold: true, fontSize: 18, color: '003366' } },
  { text: 'There is a pressing need for a tool that lives inside the browser to extract data dynamically while respecting platform limits, paired with a central database to manage that data.', options: { fontSize: 14 } }
], { x: 0.5, y: 1.2, w: '90%', h: 4.5 });

// Slide 3: Proposed Solution & Architecture
let slide3 = pres.addSlide({ masterName: 'MASTER_SLIDE' });
slide3.addText('Proposed Solution & Architecture', { x: 0.5, y: 0.1, w: '90%', h: 0.6, fontSize: 24, color: 'FFFFFF', bold: true });
slide3.addText([
  { text: 'Two-Part Architecture\n', options: { bold: true, fontSize: 18, color: '003366' } },
  { text: 'Our solution bridges the gap between the browser and a central candidate database.\n\n', options: { fontSize: 14 } },
  { text: '1. Chrome Extension (Frontend Data Extractor)\n', options: { bold: true, fontSize: 16, color: '333333' } },
  { text: 'Injects directly into LinkedIn pages to read the active DOM, bypassing traditional network blocks. It securely packages data and sends it to our custom API.\n\n', options: { fontSize: 14, bullet: true } },
  { text: '2. Express/Node.js API (Backend Server)\n', options: { bold: true, fontSize: 16, color: '333333' } },
  { text: 'A RESTful API that receives the extracted candidate JSON data, normalizes it, and securely stores it in our database for future management and viewing.\n\n', options: { fontSize: 14, bullet: true } }
], { x: 0.5, y: 1.2, w: '90%', h: 4.5 });

// Slide 4: Implementation Progress - Frontend
let slide4 = pres.addSlide({ masterName: 'MASTER_SLIDE' });
slide4.addText('Implementation Progress: Frontend Engine', { x: 0.5, y: 0.1, w: '90%', h: 0.6, fontSize: 24, color: 'FFFFFF', bold: true });
slide4.addText([
  { text: 'Structural DOM Parsing Algorithms\n', options: { bold: true, fontSize: 18, color: '003366' } },
  { text: 'We successfully engineered a scraper that ignores randomized class names. Instead, it uses structural landmarks (like profile anchor tags) to extract correct data reliably.\n\n', options: { fontSize: 14 } },
  { text: 'Auto-Pagination System\n', options: { bold: true, fontSize: 18, color: '003366' } },
  { text: 'Implemented an automated script that clicks through search result pages, waits for dynamic content to load, and extracts candidates in bulk.\n\n', options: { fontSize: 14 } },
  { text: 'Popup Interface\n', options: { bold: true, fontSize: 18, color: '003366' } },
  { text: 'Developed a clean extension popup that gives users real-time feedback on extraction progress and allows one-click bulk saving to the database.', options: { fontSize: 14 } }
], { x: 0.5, y: 1.2, w: '90%', h: 4.5 });

// Slide 5: Implementation Progress - Backend
let slide5 = pres.addSlide({ masterName: 'MASTER_SLIDE' });
slide5.addText('Implementation Progress: Backend API', { x: 0.5, y: 0.1, w: '90%', h: 0.6, fontSize: 24, color: 'FFFFFF', bold: true });
slide5.addText([
  { text: 'REST API Infrastructure\n', options: { bold: true, fontSize: 18, color: '003366' } },
  { text: 'Built standard endpoints (GET, POST, DELETE) using Express.js to handle incoming candidate data securely with API Key authentication.\n\n', options: { fontSize: 14 } },
  { text: 'Data Normalization & Storage\n', options: { bold: true, fontSize: 18, color: '003366' } },
  { text: 'Created logic to merge new extractions with existing database records to prevent duplicates and ensure data integrity.\n\n', options: { fontSize: 14 } },
  { text: 'Web Dashboard\n', options: { bold: true, fontSize: 18, color: '003366' } },
  { text: 'Designed a responsive frontend dashboard connected to the API where users can view saved candidates in a table format and manage their pipeline.', options: { fontSize: 14 } }
], { x: 0.5, y: 1.2, w: '90%', h: 4.5 });

// Slide 6: Next Steps
let slide6 = pres.addSlide({ masterName: 'MASTER_SLIDE' });
slide6.addText('Next Steps & Future Scope', { x: 0.5, y: 0.1, w: '90%', h: 0.6, fontSize: 24, color: 'FFFFFF', bold: true });
slide6.addText([
  { text: 'API-Based Data Enrichment\n', options: { bold: true, fontSize: 18, color: '003366' } },
  { text: 'Transitioning to a backend-driven model. Instead of relying purely on Chrome extraction (which risks bans at scale), the system will use third-party APIs (like Proxycurl) to fetch perfect data via URLs.\n\n', options: { fontSize: 14 } },
  { text: 'Cloud Database Migration\n', options: { bold: true, fontSize: 18, color: '003366' } },
  { text: 'Moving the local JSON database to a scalable cloud solution such as MongoDB or PostgreSQL.\n\n', options: { fontSize: 14 } },
  { text: 'Production Deployment\n', options: { bold: true, fontSize: 18, color: '003366' } },
  { text: 'Deploying the Node.js backend to a production environment (Vercel/AWS) so the extension can be distributed to end-users.', options: { fontSize: 14 } }
], { x: 0.5, y: 1.2, w: '90%', h: 4.5 });

pres.writeFile({ fileName: path.join('C:\\Users\\Abhinav Bangar\\Desktop\\SyncUp\\LinkedinEnrich', 'Project_Presentation_v2.pptx') })
  .then(() => console.log('PPTX created successfully!'))
  .catch(err => console.error(err));
