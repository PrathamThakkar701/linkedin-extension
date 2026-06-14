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
    
    let searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(role)}`;
    
    const location = document.getElementById('search-location').value.trim();
    if (location) searchUrl += ` ${encodeURIComponent('in ' + location)}`;
    
    const industry = document.getElementById('search-industry').value.trim();
    if (industry) searchUrl += ` ${encodeURIComponent(industry)}`;
    
    const company = document.getElementById('search-company').value.trim();
    if (company) searchUrl += ` ${encodeURIComponent('at ' + company)}`;
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.update(tabs[0].id, { url: searchUrl });
      }
    });
  });

  // Extract Results from Search Page
  document.getElementById('extract-results').addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (currentTab && currentTab.url.includes('linkedin.com/search/results/people')) {
        chrome.tabs.sendMessage(currentTab.id, { action: 'EXTRACT_SEARCH' }, (response) => {
          if (chrome.runtime.lastError) {
            alert("Could not extract data. Please refresh the page and try again.");
          } else if (response && response.data) {
            renderSearchResults(response.data);
          }
        });
      } else {
        alert("Please navigate to a LinkedIn People Search results page first.");
      }
    });
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

function renderSearchResults(results) {
  document.getElementById('search-form-view').classList.add('hidden');
  const resultsView = document.getElementById('search-results-view');
  resultsView.classList.remove('hidden');
  
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
