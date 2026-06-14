# SyncUp LinkedIn Enrichment Extension

A Chrome extension that seamlessly scrapes and syncs LinkedIn profiles and search results to a local database. It uses spatial DOM parsing to bypass LinkedIn's HTML obfuscation.

## Setup Instructions

### 1. Start the Backend API
The backend is a lightweight Node.js server that receives and stores scraped candidates in a local `database.json` file.

1. Open your terminal and navigate to the `api` folder:
   ```bash
   cd api
   ```
2. Install the required dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
   *(The server will spin up and run on `http://localhost:3000`)*

### 2. Install the Chrome Extension
The extension acts as the scraper and user interface.

1. Open Google Chrome and go to `chrome://extensions/`.
2. Turn on **Developer mode** (toggle switch in the top right corner).
3. Click **Load unpacked**.
4. Select the `extension` folder located inside this project directory.

## How to Use

* **Profile Scraping:** Navigate to any LinkedIn profile. Click the SyncUp extension icon in your toolbar, then click **Save to SyncUp**. You can click the profile preview card to view the raw scraped JSON data.
* **List Search Scraping:** Navigate to a LinkedIn People Search results page. Click the SyncUp extension icon and click **Extract from Search List**. You will see a list of all candidates on the page; click **Save** next to any candidate to push them directly to your database.
