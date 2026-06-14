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

## Input Processing — Three Conditions

The enrichment pipeline handles three types of input:

| Condition | Input | Flow |
|---|---|---|
| **(i) Direct URL** | LinkedIn profile URL | `POST /api/enrich-url` → Proxycurl → normalize → save |
| **(ii) Unstructured** | Name + Company | `POST /api/find` → SerpAPI → LinkedIn URL → `POST /api/enrich-url` |
| **(iii) Chrome Extension** | DOM-scraped data | `POST /api/enrich` → normalize → save |

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Health check + shows which API keys are configured |
| `POST` | `/api/find` | `x-api-key` | **(Condition ii)** Name + Company → SerpAPI → returns LinkedIn URL |
| `POST` | `/api/enrich-url` | `x-api-key` | **(Condition i)** LinkedIn URL → Proxycurl → normalize → save |
| `POST` | `/api/enrich` | `x-api-key` | **(Condition iii)** Chrome extension data → normalize → save |
| `GET` | `/api/candidates` | `x-api-key` | List all saved candidates |

### POST /api/find
```json
{ "name": "Jane Doe", "company": "Acme Corp" }
```
Runs the query `site:linkedin.com/in/ "Jane Doe" "Acme Corp"` via SerpAPI and returns the top matching LinkedIn URL.

**Response:**
```json
{
  "success": true,
  "linkedinUrl": "https://www.linkedin.com/in/janedoe",
  "title": "Jane Doe - Frontend Developer - Acme Corp | LinkedIn",
  "snippet": "...",
  "query": "site:linkedin.com/in/ \"Jane Doe\" \"Acme Corp\""
}
```

### POST /api/enrich-url
```json
{ "linkedinUrl": "https://www.linkedin.com/in/janedoe" }
```
Calls Proxycurl, normalizes the response to the candidate schema, and upserts into the local DB.

### POST /api/enrich *(Chrome Extension)*
```json
{
  "linkedinUrl": "https://www.linkedin.com/in/username",
  "name": "Jane Doe",
  "headline": "Frontend Developer at Acme",
  "currentCompany": "Acme Corp",
  "location": "Bangalore, India",
  "email": "", "phone": "", "photoUrl": "https://...",
  "skills": [], "experience": [], "education": []
}
```

All three endpoints share the same **deduplication** logic — saving the same `linkedinUrl` twice merges/updates the existing record rather than creating a duplicate.

### Candidate Schema
```json
{
  "id": "cand_...",
  "fullName": "Jane Doe",
  "jobTitle": "Frontend Developer",
  "company": "Acme Corp",
  "location": "Bangalore, India",
  "email": "",
  "phone": "",
  "linkedinUrl": "https://www.linkedin.com/in/janedoe",
  "photoUrl": "",
  "skills": [],
  "experience": [],
  "education": [],
  "source": "proxycurl | linkedin-extension | api",
  "createdAt": "...",
  "updatedAt": "..."
}
```

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
