document.addEventListener('DOMContentLoaded', () => {
  // Tab Switching
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
    });
  });

  // Settings
  document.getElementById('open-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Load Profile on Startup if on LinkedIn
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    if (currentTab && currentTab.url.includes('linkedin.com/in/')) {
      // Send message to content script
      chrome.tabs.sendMessage(currentTab.id, { action: 'EXTRACT_PROFILE' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError.message);
          document.getElementById('profile-status').innerHTML = '<p class="error-msg">Could not extract data. Please refresh the LinkedIn page.</p>';
        } else if (response && response.data) {
          currentProfileData = response.data;
          renderProfilePreview(response.data);
        }
      });
    } else {
      document.getElementById('profile-status').innerHTML = '<p class="error-msg">Please navigate to a LinkedIn profile.</p>';
      document.getElementById('save-current-profile').disabled = true;
    }
  });

  // Profile Save
  document.getElementById('save-current-profile').addEventListener('click', () => {
    if (!currentProfileData) return;
    saveToApi(currentProfileData, document.getElementById('save-message'), document.getElementById('save-current-profile'));
  });

  // List Search Construction
  document.getElementById('run-search').addEventListener('click', () => {
    const role = document.getElementById('search-role').value.trim();
    if (!role) {
      alert("Role is required.");
      return;
    }
    
    // Build a clean keyword string combining role, location, company
    const keywordParts = [role];
    
    const location = document.getElementById('search-location').value.trim();
    if (location) keywordParts.push(location);
    
    const company = document.getElementById('search-company').value.trim();
    if (company) keywordParts.push(company);

    const industry = document.getElementById('search-industry').value.trim();
    if (industry) keywordParts.push(industry);

    const params = new URLSearchParams({
      keywords: keywordParts.join(' '),
      origin: 'GLOBAL_SEARCH_HEADER'
    });

    // "Open to Work" filter uses LinkedIn's built-in facet
    const openToWork = document.getElementById('search-opentowork').value;
    if (openToWork === 'true') {
      params.set('openToWork', 'true');
    }

    const searchUrl = `https://www.linkedin.com/search/results/people/?${params.toString()}`;
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.update(tabs[0].id, { url: searchUrl });
      }
    });
  });

  // Auto Extract Pages
  document.getElementById('auto-extract-btn').addEventListener('click', () => {
    const pagesInput = document.getElementById('auto-extract-pages').value;
    const maxPages = pagesInput ? parseInt(pagesInput) : 'all';
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (currentTab && currentTab.url.includes('linkedin.com/search/results/people')) {
        document.getElementById('search-form-view').classList.add('hidden');
        document.getElementById('search-results-view').classList.remove('hidden');
        document.getElementById('auto-extract-status').style.display = 'block';
        document.getElementById('auto-extract-status').innerText = 'Initializing extraction...';
        document.getElementById('bulk-save-btn').style.display = 'none';
        document.getElementById('bulk-save-message').innerText = '';
        document.getElementById('candidate-list').innerHTML = '';
        document.getElementById('results-count').innerText = `Extracting...`;

        chrome.tabs.sendMessage(currentTab.id, { action: 'START_PAGINATION', maxPages }, (response) => {
          if (chrome.runtime.lastError) {
            alert("Could not start. Please refresh the page and try again.");
          }
        });
      } else {
        alert("Please navigate to a LinkedIn People Search results page first.");
      }
    });
  });

  // Listen for progress from content script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'PAGINATION_PROGRESS') {
        document.getElementById('auto-extract-status').innerText = `Scraping page ${message.pagesScraped}... Extracted ${message.totalCandidates} candidates so far.`;
        renderSearchResults(message.allResults, true);
    } else if (message.action === 'PAGINATION_COMPLETE') {
        document.getElementById('auto-extract-status').innerText = `Finished! Extracted ${message.totalCandidates} candidates across ${message.pagesScraped} pages.`;
        document.getElementById('results-count').innerText = `${message.totalCandidates} candidates found`;
        
        if (message.totalCandidates > 0) {
            document.getElementById('bulk-save-btn').style.display = 'inline-block';
            document.getElementById('bulk-save-btn').onclick = async () => {
                const btn = document.getElementById('bulk-save-btn');
                const msgEl = document.getElementById('bulk-save-message');
                btn.disabled = true;
                btn.innerText = 'Saving...';
                
                chrome.storage.sync.get(['apiUrl', 'apiKey'], async (settings) => {
                    const apiUrl = settings.apiUrl || 'http://localhost:3000';
                    const apiKey = settings.apiKey || 'syncup-dev-key';
                    
                    let successCount = 0;
                    let failCount = 0;
                    
                    for (const cand of message.allResults) {
                        try {
                            const res = await fetch(`${apiUrl}/api/enrich-url`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
                                body: JSON.stringify({ linkedinUrl: cand.linkedinUrl })
                            });
                            if (res.ok) successCount++;
                            else failCount++;
                        } catch(e) {
                            failCount++;
                        }
                    }
                    msgEl.innerHTML = `<span class="success-msg">Successfully saved ${successCount} candidates! ${failCount > 0 ? '('+failCount+' failed)' : ''}</span>`;
                    btn.innerText = 'Saved to SyncUp';
                });
            };
        }
    }
  });

  document.getElementById('back-to-search').addEventListener('click', () => {
    document.getElementById('search-results-view').classList.add('hidden');
    document.getElementById('search-form-view').classList.remove('hidden');
  });
});

let currentProfileData = null;

function renderProfilePreview(data) {
  document.getElementById('profile-status').classList.add('hidden');
  const preview = document.getElementById('profile-preview');
  preview.classList.remove('hidden');
  
  document.getElementById('preview-photo').src = data.photoUrl || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  document.getElementById('preview-name').innerText = data.name || 'Unknown';
  document.getElementById('preview-headline').innerText = data.headline || 'No headline';
  document.getElementById('preview-meta').innerText = `${data.location} • ${data.currentCompany}`;
  document.getElementById('save-current-profile').disabled = false;

  // JSON Debugger View
  document.getElementById('json-view').innerText = JSON.stringify(data, null, 2);
  preview.onclick = () => {
    document.getElementById('json-view-container').classList.toggle('hidden');
  };
}

function renderSearchResults(results, isProgressUpdate = false) {
  if (!isProgressUpdate) {
      document.getElementById('search-form-view').classList.add('hidden');
      document.getElementById('search-results-view').classList.remove('hidden');
      document.getElementById('results-count').innerText = `${results.length} candidates found`;
  }
  
  document.getElementById('results-count').innerText = `${results.length} candidates found`;
  const list = document.getElementById('candidate-list');
  list.innerHTML = '';
  
  results.forEach((cand, index) => {
    const card = document.createElement('div');
    card.className = 'candidate-card';
    card.innerHTML = `
      <div class="candidate-info">
        <img src="${cand.photoUrl || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}" class="candidate-photo">
        <div class="candidate-details">
          <div class="candidate-name">${cand.name || 'LinkedIn Member'}</div>
          <div class="candidate-headline">${cand.headline || ''}</div>
          <div class="candidate-meta">${cand.location}</div>
        </div>
      </div>
      <div class="candidate-actions">
        <button class="btn save-candidate-btn" id="save-cand-${index}">Save</button>
      </div>
      <div id="save-msg-${index}" class="text-center"></div>
    `;
    list.appendChild(card);
    
    document.getElementById(`save-cand-${index}`).addEventListener('click', () => {
      saveToApi(cand, document.getElementById(`save-msg-${index}`), document.getElementById(`save-cand-${index}`));
    });
  });
}

async function saveToApi(data, msgElement, btnElement = null) {
  if (btnElement) {
    btnElement.disabled = true;
    btnElement.innerText = 'Saving...';
  }
  msgElement.innerHTML = '<span style="color:var(--text-muted)">Saving...</span>';
  
  chrome.storage.sync.get(['apiUrl', 'apiKey'], async (settings) => {
    const apiUrl = settings.apiUrl || 'http://localhost:3000';
    const apiKey = settings.apiKey || 'syncup-dev-key';
    
    try {
      const res = await fetch(`${apiUrl}/api/enrich`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      
      if (res.ok) {
        msgElement.innerHTML = '<span class="success-msg">Saved successfully!</span>';
        if (btnElement) { btnElement.innerText = 'Saved'; }
      } else {
        msgElement.innerHTML = `<span class="error-msg">Error: ${json.message || json.error}</span>`;
        if (btnElement) { btnElement.disabled = false; btnElement.innerText = 'Retry'; }
      }
    } catch (e) {
      msgElement.innerHTML = `<span class="error-msg">Network error: ${e.message}</span>`;
      if (btnElement) { btnElement.disabled = false; btnElement.innerText = 'Retry'; }
    }
  });
}
