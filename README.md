# SyncUp LinkedIn Enrichment Extension

A two-part tool that finds LinkedIn profiles from multiple input types and saves them to SyncUp with zero manual data entry.

- **Part A — Chrome Extension:** While browsing LinkedIn, save any profile to SyncUp instantly with all fields pre-filled.
- **Part B — Enrichment API:** Node.js/Express backend that validates, deduplicates, and stores candidate data.

---

## Architecture

```
Chrome Extension (Manifest V3)
    ├── content.js       — Scrapes LinkedIn profile DOM + embedded JSON
    ├── popup.js         — Two-mode UI: "Save Profile" + "List Search"
    ├── popup.html       — Extension popup UI
    ├── options.html/js  — API URL + API Key settings
    └── styles.css       — Extension styles

Node.js/Express API
    ├── server.js        — REST API with auth, deduplication, and local JSON DB
    └── vercel.json      — Vercel deployment config
```

---

## Setup

### 1. Start the Backend API

```bash
cd api
npm install
npm start
```

The server runs on `http://localhost:3000`.

**Environment Variables (for production on Vercel):**
| Variable | Description |
|---|---|
| `API_KEY` | Secret key for extension authentication |

### 2. Install the Chrome Extension

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `extension/` folder

### 3. Configure the Extension

Click the ⚙️ icon in the popup and set:
- **API URL** — `http://localhost:3000` (or your Vercel URL once deployed)
- **API Key** — matches the `API_KEY` env variable on the server

---

## How to Use

### Save a Profile
1. Navigate to any LinkedIn profile (`linkedin.com/in/...`)
2. Click the SyncUp extension icon
3. Preview the extracted data, then click **Save to SyncUp**

### List Search
1. Go to the **List Search** tab in the popup
2. Enter a role/designation and optional filters (location, company, industry, open to work)
3. Click **Search on LinkedIn** — the extension opens the search results page
4. Click **Extract Results from Page** to pull all visible candidates
5. Click **Save** next to any candidate to push them to the database

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Health check |
| `POST` | `/api/enrich` | `x-api-key` | Save/update a candidate |
| `GET` | `/api/candidates` | `x-api-key` | List all saved candidates |

**POST /api/enrich — Request Body:**
```json
{
  "linkedinUrl": "https://www.linkedin.com/in/username",
  "name": "Jane Doe",
  "headline": "Frontend Developer at Acme",
  "currentCompany": "Acme Corp",
  "location": "Bangalore, India",
  "email": "",
  "phone": "",
  "photoUrl": "https://...",
  "skills": [],
  "experience": [],
  "education": []
}
```

Deduplication is handled automatically — saving the same `linkedinUrl` twice will update the existing record.

---

## Deploy on Vercel (Stage 04)

```bash
cd api
npx vercel --prod
```

Add `API_KEY` as an environment variable in the Vercel dashboard. Update the extension's API URL in Settings to your Vercel deployment URL. Vercel auto-deploys on every push to GitHub.

---

## Testing Checklist

- [ ] Save 20+ real profiles — different layouts (open to work, premium, no email, different industries)
- [ ] Search for 5 different designations with various filter combinations
- [ ] Try saving the same profile twice — confirm the API updates (not duplicates) and returns success
- [ ] Test edge cases: missing fields, non-English profiles, private profiles
