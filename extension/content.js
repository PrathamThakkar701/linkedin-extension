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

  // 7. Experience Extraction
  const experienceArray = [];
  const h2s = document.querySelectorAll('h2');
  let expHeader = null;
  for (const h2 of h2s) {
      if (h2.innerText && h2.innerText.trim().toLowerCase() === 'experience') {
          expHeader = h2;
          break;
      }
  }

  if (expHeader) {
      // Find the sibling container that holds the list of experience items
      let listContainer = null;
      let curr = expHeader.parentElement;
      while (curr && curr.tagName !== 'BODY') {
          // Check if the next sibling contains the entity-collection items
          if (curr.nextElementSibling && curr.nextElementSibling.querySelector('[componentkey^="entity-collection-item-"]')) {
             listContainer = curr.nextElementSibling;
             break;
          }
          // If the current element itself contains them (fallback)
          if (curr.querySelector('[componentkey^="entity-collection-item-"]')) {
             listContainer = curr;
             break;
          }
          curr = curr.parentElement;
      }

      if (listContainer) {
          const items = listContainer.querySelectorAll('[componentkey^="entity-collection-item-"]');
          items.forEach(item => {
              const expLines = item.innerText.split('\n').map(l => l.trim()).filter(l => l.length > 0 && l !== '·' && !l.includes('...'));
              if (expLines.length >= 2) {
                 experienceArray.push({
                     title: expLines[0],
                     company: expLines[1],
                     duration: expLines[2] || '',
                     details: expLines.slice(3, 6).join(' | ') 
                 });
              }
          });
      }
  }
  result.experience = experienceArray;

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
  // LinkedIn recently changed their search results from <li> to <div role="listitem">
  const cards = document.querySelectorAll('li.reusable-search__result-container, [role="listitem"]');
  
  cards.forEach(card => {
    const item = {};
    
    // Fallback logic to get the profile URL
    const urlEl = card.querySelector('a.app-aware-link, a[href*="linkedin.com/in/"], a[href^="https://www.linkedin.com/in/"]');
    if (!urlEl) return; // If there's no profile link in this listitem, skip it
    
    // Parse the URL
    item.linkedinUrl = urlEl.href.split('?')[0];
    
    // Look for an image
    const photoEl = card.querySelector('img.presence-entity__image, img[src*="profile-displayphoto"], img[alt]');
    item.photoUrl = photoEl && photoEl.src.includes('http') ? photoEl.src : '';
    
    // Name is usually the alt text of the photo or inside an anchor
    const nameEl = card.querySelector('.entity-result__title-text a span[aria-hidden="true"], span[dir="ltr"] span[aria-hidden="true"]');
    if (nameEl) {
       item.name = nameEl.textContent.trim();
    } else if (photoEl && photoEl.alt && photoEl.alt.length > 0) {
       // Many times the image has the user's name as alt text
       item.name = photoEl.alt.trim();
    } else {
       // Deeply nested anchor text fallback
       const textAnchors = card.querySelectorAll('a[href*="/in/"]');
       for (const a of textAnchors) {
          if (a.innerText && a.innerText.trim().length > 0) {
             item.name = a.innerText.trim();
             break;
          }
       }
    }
    
    if (!item.name) item.name = 'Unknown';

    // The texts are usually in multiple <p> tags if obfuscated, or standard entity-result classes.
    const headlineEl = card.querySelector('.entity-result__primary-subtitle');
    const locationEl = card.querySelector('.entity-result__secondary-subtitle');
    
    if (headlineEl) {
      item.headline = headlineEl.textContent.trim();
      item.location = locationEl ? locationEl.textContent.trim() : '';
    } else {
      // Obfuscated fallback: Get all <p> tags. 
      // The first <p> is usually the name/connection degree.
      // The second <p> is the headline.
      // The third <p> is the location.
      const pTags = Array.from(card.querySelectorAll('p')).filter(p => p.innerText && p.innerText.trim().length > 0);
      if (pTags.length >= 2) {
         item.headline = pTags[1].innerText.trim();
      }
      if (pTags.length >= 3) {
         item.location = pTags[2].innerText.trim();
      }
    }

    item.currentCompany = '';

    // Only add if we got a valid profile URL
    if (item.linkedinUrl && item.linkedinUrl.includes('/in/')) {
      // Deduplicate in case multiple list items render the same person
      if (!results.some(r => r.linkedinUrl === item.linkedinUrl)) {
          results.push(item);
      }
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
        phone: '',
        experience:      fromDOM?.experience || []
      };

      sendResponse({ success: true, data: result });
    });

    return true; // required for async sendResponse
  } else if (message.action === 'EXTRACT_SEARCH') {
    sendResponse({ success: true, data: extractSearchResultsData() });
    return true;
  }
});
