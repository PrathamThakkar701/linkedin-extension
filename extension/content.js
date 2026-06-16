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
  const photoEl = profileSection.querySelector('img.pv-top-card-profile-picture__image, img[src*="profile-displayphoto"], img[src*="profile-framedphoto"]');
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

  // 8. Skills Extraction
  const skillsArray = [];
  let skillsHeader = null;
  for (const h2 of h2s) {
      const text = (h2.textContent || h2.innerText || '').trim().toLowerCase();
      if (text === 'skills' || text.includes('skills')) {
          skillsHeader = h2;
          break;
      }
  }

  if (skillsHeader) {
      // Find the card container wrapping the Skills section
      let card = skillsHeader.closest('section') || skillsHeader.closest('.artdeco-card');
      
      // Fallback: walk up until we find a container holding the skill paragraphs
      if (!card) {
          let curr = skillsHeader.parentElement;
          while (curr && curr.tagName !== 'BODY') {
              if (curr.querySelectorAll('p').length > 2) {
                  card = curr;
                  break;
              }
              curr = curr.parentElement;
          }
      }

      if (card) {
          // Grab candidate text nodes
          const candidateNodes = card.querySelectorAll('p span[aria-hidden="true"], p > span, p');
          
          candidateNodes.forEach(node => {
              // If it's a p that has a span, skip it (we'll process the span itself)
              if (node.tagName === 'P' && node.querySelector('span')) return;
              
              const text = (node.textContent || node.innerText || '').trim();
              if (!text || text.length > 50 || text.toLowerCase() === 'skills') return;
              
              // Skip known footer/noise elements
              if (text.toLowerCase().includes('show all') || text.toLowerCase().includes('endorsement')) return;

              // Heuristic: Primary skills do NOT have SVG icons next to them. 
              // Sub-items (like projects using the skill) have SVG icons (folders, buildings) as siblings in the tree.
              let isSubItem = false;
              let curr = node;
              
              // Walk up to 4 levels to check for SVG siblings
              for(let i=0; i<4; i++) {
                  if (!curr) break;
                  
                  let prev = curr.previousElementSibling;
                  while(prev) {
                      if (prev.tagName && prev.tagName.toUpperCase() === 'SVG' || prev.querySelector && prev.querySelector('svg')) {
                          isSubItem = true;
                          break;
                      }
                      prev = prev.previousElementSibling;
                  }
                  
                  if (isSubItem) break;
                  curr = curr.parentElement;
              }
              
              if (!isSubItem && !skillsArray.includes(text)) {
                  skillsArray.push(text);
              }
          });
      }
  }
  result.skills = skillsArray;



  // Final Fallbacks
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
  
  // Safely locate the main search results container to avoid grabbing global nav items
  const container = document.querySelector('.search-results-container, ul.reusable-search__entity-result-list, main');
  if (!container) return results;

  // Grab the actual cards using standard classes or the fallback listitem role
  let cards = Array.from(container.querySelectorAll('li.reusable-search__result-container, ul.reusable-search__entity-result-list > li, div.entity-result, [role="listitem"]'));
  
  // Obfuscated Layout Fallback: if no standard cards are found, find profile links and use their parent wrappers
  if (cards.length === 0) {
      const links = Array.from(container.querySelectorAll('a[href*="/in/"]'));
      const parents = new Set();
      links.forEach(a => {
          if (a.parentElement) parents.add(a.parentElement);
      });
      cards = Array.from(parents);
  }
  
  cards.forEach(card => {
    const item = {};
    
    // Fallback logic to get the profile URL
    const urlEl = card.querySelector('a.app-aware-link, a[href*="linkedin.com/in/"], a[href^="https://www.linkedin.com/in/"]');
    if (!urlEl) return; // If there's no profile link in this listitem, skip it
    
    // Parse the URL
    item.linkedinUrl = urlEl.href.split('?')[0];
    
    // Strictly look for the candidate's main image wrapper
    let photoUrl = '';
    let imgEl = null;
    
    // In new layouts, the anchor tag wraps the entire profile block including the image
    if (urlEl) {
        imgEl = urlEl.querySelector('img');
    }
    
    // Fallback to standard classes or CDN URLs
    if (!imgEl) {
        imgEl = card.querySelector('.entity-result__image img, .presence-entity img, img[src*="profile-displayphoto"], img[src*="profile-framedphoto"]');
    }

    if (imgEl) {
        // LinkedIn lazy-loads images. The real URL is often in data-delayed-url
        photoUrl = imgEl.getAttribute('data-delayed-url') || imgEl.getAttribute('data-src') || imgEl.getAttribute('src') || '';
        if (!photoUrl.includes('http') || photoUrl.startsWith('data:')) {
            photoUrl = '';
        }
    }
    item.photoUrl = photoUrl;
    
    // Name is usually the alt text of the photo or inside an anchor
    const nameEl = card.querySelector('.entity-result__title-text a span[aria-hidden="true"], span[dir="ltr"] span[aria-hidden="true"]');
    if (nameEl) {
       item.name = nameEl.textContent.trim();
    } else if (imgEl && imgEl.alt && imgEl.alt.length > 0) {
       // Many times the image has the user's name as alt text
       item.name = imgEl.alt.trim();
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
    
    // Sanitize the name to remove the rest of the card text if the anchor wrapped everything
    if (item.name.includes('\n')) {
        item.name = item.name.split('\n')[0];
    }
    // Remove connection degree (e.g. 'Priya M. • 2nd' -> 'Priya M.')
    if (item.name.includes('•')) {
        item.name = item.name.split('•')[0];
    }
    item.name = item.name.trim();

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

async function autoPaginateSearch(maxPages) {
  let pagesScraped = 0;
  let allResults = [];
  
  while (maxPages === 'all' || pagesScraped < maxPages) {
      // 1. Extract current page
      const results = extractSearchResultsData();
      
      // Deduplicate before adding
      results.forEach(cand => {
          if (!allResults.some(r => r.linkedinUrl === cand.linkedinUrl)) {
              allResults.push(cand);
          }
      });
      
      pagesScraped++;
      
      // Send progress to popup
      try {
          chrome.runtime.sendMessage({
              action: 'PAGINATION_PROGRESS',
              pagesScraped,
              totalCandidates: allResults.length,
              allResults
          });
      } catch(e) {}
      
      // 2. Check limits
      if (maxPages !== 'all' && pagesScraped >= maxPages) break;
      
      // 3. Scroll to the bottom to ensure pagination button is visible
      const scrollableDiv = document.querySelector('.scaffold-layout__main, #main, .authentication-outlet, main');
      if (scrollableDiv) {
          scrollableDiv.scrollTo(0, scrollableDiv.scrollHeight);
      }
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise(r => setTimeout(r, 1500));
      
      // 4. Find Next button
      let nextBtn = document.querySelector('button.artdeco-pagination__button--next');
      if (!nextBtn) nextBtn = document.querySelector('button[aria-label="Next"]');
      if (!nextBtn) nextBtn = document.querySelector('button[aria-label="Next page"]');
      if (!nextBtn) {
          nextBtn = Array.from(document.querySelectorAll('button')).find(b => {
              const text = (b.innerText || '').trim();
              return text === 'Next' || text === 'Next page';
          });
      }
      
      if (!nextBtn || nextBtn.disabled) break; // End of results
      
      // 5. Click Next
      nextBtn.click();
      
      // 6. Wait for new results to load
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Wait for at least one card to appear to ensure loading finished
      let retries = 0;
      while(!document.querySelector('li.reusable-search__result-container, [role="listitem"], main a[href*="/in/"]') && retries < 10) {
          await new Promise(resolve => setTimeout(resolve, 500));
          retries++;
      }
      
      // Extra buffer to let images/texts settle
      await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  try {
      chrome.runtime.sendMessage({
          action: 'PAGINATION_COMPLETE',
          pagesScraped,
          totalCandidates: allResults.length,
          allResults
      });
  } catch(e) {}
}

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
        experience:      fromDOM?.experience || [],
        skills:          fromDOM?.skills || []
      };

      sendResponse({ success: true, data: result });
    });

    return true; // required for async sendResponse
  } else if (message.action === 'EXTRACT_SEARCH') {
    sendResponse({ success: true, data: extractSearchResultsData() });
    return true;
  } else if (message.action === 'START_PAGINATION') {
    autoPaginateSearch(message.maxPages);
    sendResponse({ success: true });
    return true;
  }
});
