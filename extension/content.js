// --- PROFILE EXTRACTION (Claude's JSON + DOM fallback) ---

function extractFromEmbeddedJSON() {
  const codeTags = document.querySelectorAll('code[id^="bpr-guid-"]');
  
  for (const tag of codeTags) {
    try {
      const json = JSON.parse(tag.textContent);
      const profile = findProfileData(json);
      if (profile) return profile;
    } catch (e) {
      continue;
    }
  }
  return null;
}

function findProfileData(obj, depth = 0) {
  if (depth > 6 || !obj || typeof obj !== 'object') return null;
  
  if (obj.firstName && obj.headline !== undefined) {
    return {
      name: `${obj.firstName} ${obj.lastName || ''}`.trim(),
      headline: obj.headline || '',
      location: obj.geoLocationName || obj.locationName || '',
      photoUrl: extractPhoto(obj),
    };
  }
  
  for (const key of Object.keys(obj)) {
    const result = findProfileData(obj[key], depth + 1);
    if (result) return result;
  }
  return null;
}

function extractPhoto(obj) {
  try {
    const img = obj.profilePicture?.displayImageReference?.vectorImage;
    if (img?.artifacts?.length) {
      const largest = img.artifacts.sort((a, b) => b.width - a.width)[0];
      return img.rootUrl + largest.fileIdentifyingUrlPathSegment;
    }
  } catch (e) {}
  return '';
}

function extractFromDOM() {
  const result = {};

  // 1. Get Name securely from the page title
  const titleParts = document.title.split('|')[0].split('-').map(p => p.trim());
  result.name = titleParts[0] || 'Unknown';

  // 2. Get the main profile section
  const profileSection = document.querySelector('main section:first-of-type, .pv-top-card') || document.body;
  
  // 3. Get all visible text lines in order
  const lines = profileSection.innerText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  // 4. Locate the name to establish our anchor point
  let nameIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(result.name.toLowerCase()) || result.name.toLowerCase().includes(lines[i].toLowerCase())) {
      nameIndex = i;
      break;
    }
  }

  if (nameIndex !== -1) {
    let nextIndex = nameIndex + 1;
    
    // Skip pronouns if they exist
    const pronouns = ['he/him', 'she/her', 'they/them'];
    if (lines[nextIndex] && pronouns.some(p => lines[nextIndex].toLowerCase().includes(p))) {
      nextIndex++;
    }

    // The line immediately after the name (and pronouns) is the headline
    if (lines[nextIndex]) {
      result.headline = lines[nextIndex];
    }

    // Location is usually right before "Contact info"
    let contactInfoIndex = lines.findIndex(l => l.toLowerCase() === 'contact info');
    if (contactInfoIndex !== -1) {
       if (lines[contactInfoIndex - 1] === '·' && lines[contactInfoIndex - 2]) {
           result.location = lines[contactInfoIndex - 2];
       } else if (lines[contactInfoIndex - 1]) {
           result.location = lines[contactInfoIndex - 1];
       }
    }
  }

  // 5. Find Current Company via logo SVG heuristics
  const companySvg = profileSection.querySelector('svg[id^="company-"]');
  if (companySvg) {
    const companyContainer = companySvg.closest('div').parentElement;
    if (companyContainer && companyContainer.innerText) {
       result.currentCompany = companyContainer.innerText.split('\n')[0].trim();
    }
  }

  // 6. Photo URL
  const photoEl = document.querySelector('img[src*="profile-displayphoto"]');
  if (photoEl) result.photoUrl = photoEl.src;

  // Final Fallbacks
  if (!result.headline) result.headline = titleParts[1] || 'No headline';
  if (!result.location) result.location = 'Unknown Location';
  if (!result.currentCompany) result.currentCompany = 'Unknown Company';

  return result;
}

function waitForProfileCard() {
  return new Promise((resolve) => {
    // Look for the generic main section or the display photo
    if (document.querySelector('main section:first-of-type') || document.querySelector('img[src*="profile-displayphoto"]')) {
      resolve();
      return;
    }
    const observer = new MutationObserver(() => {
      if (document.querySelector('main section:first-of-type') || document.querySelector('img[src*="profile-displayphoto"]')) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      resolve(); 
    }, 5000); // 5s timeout
  });
}

// --- SEARCH EXTRACTION ---

const extractSearchResultsData = () => {
  const results = [];
  const cards = document.querySelectorAll('li.reusable-search__result-container, .search-result__occluded-item');
  
  cards.forEach(card => {
    const item = {};
    const nameEl = card.querySelector('.entity-result__title-text a span[aria-hidden="true"], span[dir="ltr"] span[aria-hidden="true"], .entity-result__title-line a span');
    const urlEl = card.querySelector('.entity-result__title-text a, a.app-aware-link');
    const headlineEl = card.querySelector('.entity-result__primary-subtitle');
    const locationEl = card.querySelector('.entity-result__secondary-subtitle');
    const photoEl = card.querySelector('img.presence-entity__image, img[src*="profile-displayphoto"], .entity-result__image img');

    item.name = nameEl ? nameEl.textContent.trim() : '';
    item.linkedinUrl = urlEl ? urlEl.href.split('?')[0] : '';
    item.headline = headlineEl ? headlineEl.textContent.trim() : '';
    item.location = locationEl ? locationEl.textContent.trim() : '';
    item.photoUrl = photoEl ? photoEl.src : '';
    item.currentCompany = '';

    if (item.name && item.linkedinUrl.includes('/in/')) {
      results.push(item);
    }
  });

  return results;
};

// --- MESSAGE LISTENER ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'EXTRACT_PROFILE') {
    waitForProfileCard().then(() => {
      const fromJSON = extractFromEmbeddedJSON();
      const fromDOM  = extractFromDOM();
      
      const linkedinUrlMatch = window.location.href.match(/linkedin\.com\/in\/[^\/\?]+/);
      const url = linkedinUrlMatch ? `https://www.${linkedinUrlMatch[0]}` : window.location.href;

      const titleParts = document.title.split('|')[0].split('-').map(p => p.trim());

      const result = {
        name:            fromJSON?.name            || fromDOM?.name            || titleParts[0] || 'Unknown',
        headline:        fromJSON?.headline        || fromDOM?.headline        || titleParts[1] || 'No headline',
        location:        fromJSON?.location        || fromDOM?.location        || 'Unknown Location',
        currentCompany:  fromJSON?.currentCompany  || fromDOM?.currentCompany  || 'Unknown Company',
        photoUrl:        fromJSON?.photoUrl        || fromDOM?.photoUrl        || '',
        linkedinUrl:     url,
        email: '',
        phone: ''
      };

      sendResponse({ success: true, data: result });
    });

    return true; // required for async sendResponse
  } else if (message.action === 'EXTRACT_SEARCH') {
    sendResponse({ success: true, data: extractSearchResultsData() });
    return true;
  }
});
