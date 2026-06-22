document.addEventListener('DOMContentLoaded', () => {
    // Toast Notification System
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let icon = '<i class="fa-solid fa-circle-info"></i>';
        if (type === 'error') icon = '<i class="fa-solid fa-circle-exclamation"></i>';
        if (type === 'success') icon = '<i class="fa-solid fa-circle-check"></i>';

        toast.innerHTML = `${icon} <span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // Override native alert to use toaster
    window.alert = function(message) {
        showToast(message, 'error');
    };

    // Custom Confirm Modal
    function showConfirm(message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirm-modal');
            const msgEl = document.getElementById('confirm-message');
            const btnOk = document.getElementById('confirm-ok-btn');
            const btnCancel = document.getElementById('confirm-cancel-btn');
            const backdrop = document.getElementById('confirm-backdrop');

            if (!modal) return resolve(window.confirm(message)); // Fallback

            msgEl.innerText = message;
            modal.classList.remove('hidden');

            const closeAndResolve = (result) => {
                modal.classList.add('hidden');
                btnOk.removeEventListener('click', onOk);
                btnCancel.removeEventListener('click', onCancel);
                backdrop.removeEventListener('click', onCancel);
                resolve(result);
            };

            const onOk = () => closeAndResolve(true);
            const onCancel = () => closeAndResolve(false);

            btnOk.addEventListener('click', onOk);
            btnCancel.addEventListener('click', onCancel);
            backdrop.addEventListener('click', onCancel);
        });
    }

    const listBody = document.getElementById('candidates-list');
    const searchInput = document.getElementById('search-input');
    const refreshBtn = document.getElementById('refresh-btn');
    const apiKeyInput = document.getElementById('api-key-input');
    const toggleKeyBtn = document.getElementById('toggle-key-visibility');
    const countDisplay = document.getElementById('candidate-count-display');
    const errorContainer = document.getElementById('error-container');
    const errorTitle = document.getElementById('error-title');
    const errorMessage = document.getElementById('error-message');

    // Modal elements
    const modal = document.getElementById('candidate-modal');
    const modalBackdrop = document.getElementById('modal-backdrop');
    const modalClose = document.getElementById('modal-close');
    const modalPhoto = document.getElementById('modal-photo');
    const modalName = document.getElementById('modal-name');
    const modalHeadline = document.getElementById('modal-headline');
    const modalLocation = document.getElementById('modal-location').querySelector('span');
    const modalExperience = document.getElementById('modal-experience');
    const modalRaw = document.getElementById('modal-raw');
    const fetchContactBtn = document.getElementById('fetch-contact-btn');
    const fetchMoreBtn = document.getElementById('fetch-more-btn');
    const modalContactInfo = document.getElementById('modal-contact-info');
    const modalEmail = document.getElementById('modal-email');
    const modalPhone = document.getElementById('modal-phone');

    // Sourcing Elements
    const sourceName = document.getElementById('source-name');
    const sourceCompany = document.getElementById('source-company');
    const sourceFindBtn = document.getElementById('source-find-btn');
    const sourceResult = document.getElementById('source-result');
    const sourceLink = document.getElementById('source-link');
    const sourceEnrichBtn = document.getElementById('source-enrich-btn');
    const sourceOpenBtn = document.getElementById('source-open-btn');

    // Tabs
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    // Filters
    const filterTitle = document.getElementById('filter-title');
    const filterCompany = document.getElementById('filter-company');
    const filterLocation = document.getElementById('filter-location');

    let allCandidates = [];

    // Toggle API Key visibility
    toggleKeyBtn.addEventListener('click', () => {
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            toggleKeyBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
        } else {
            apiKeyInput.type = 'password';
            toggleKeyBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
        }
    });

    // Fetch Candidates from API
    async function fetchCandidates() {
        const apiKey = apiKeyInput.value.trim() || 'syncup-dev-key';
        listBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></td></tr>';
        errorContainer.classList.add('hidden');

        try {
            const res = await fetch('/api/candidates', {
                headers: {
                    'x-api-key': apiKey
                }
            });
            const data = await res.json();

            if (res.ok && data.success) {
                allCandidates = data.candidates || [];
                // Sort by newest first
                allCandidates.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
                applyFilters();
            } else {
                showError('Authentication Failed', data.error || 'Invalid API Key');
                allCandidates = [];
                applyFilters();
            }
        } catch (e) {
            showError('Network Error', e.message);
            allCandidates = [];
            applyFilters();
        }
    }

    function showError(title, msg) {
        errorTitle.innerText = title;
        errorMessage.innerText = msg;
        errorContainer.classList.remove('hidden');
    }

    // Render logic
    function renderCandidates(candidates) {
        listBody.innerHTML = '';
        countDisplay.innerText = `${candidates.length} candidate${candidates.length !== 1 ? 's' : ''} total`;

        if (candidates.length === 0 && errorContainer.classList.contains('hidden')) {
            listBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">No candidates found. Start scraping using the SyncUp Extension!</td></tr>';
            return;
        }

        candidates.forEach((cand) => {
            const tr = document.createElement('tr');
            
            const photo = cand.photoUrl || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            const profileLink = cand.linkedinUrl || '#';

            // Latest Experience
            let latestExpHtml = '<span class="text-muted">-</span>';
            if (cand.experience && cand.experience.length > 0) {
                const latest = cand.experience[0];
                latestExpHtml = `
                    <div class="exp-cell">
                        <div class="exp-title">${escapeHtml(latest.title || '')}</div>
                        <div class="exp-company">${escapeHtml(latest.company || '')}</div>
                    </div>
                `;
            }

            const locationStr = (cand.location && cand.location.toLowerCase() !== 'true') ? cand.location : '-';

            const updatedDate = new Date(cand.updatedAt || cand.createdAt).toLocaleDateString();

            tr.innerHTML = `
                <td>
                    <div class="candidate-cell">
                        <img src="${photo}" alt="Avatar" class="avatar" onerror="this.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'">
                        <div class="user-name">
                            <a href="${profileLink}" target="_blank" class="profile-link">${escapeHtml(cand.fullName || 'Unknown')}</a>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="user-headline" title="${escapeHtml(cand.jobTitle || '')}">${escapeHtml(cand.jobTitle || '-')}</div>
                </td>
                <td>
                    <div class="user-location">${escapeHtml(locationStr)}</div>
                </td>
                <td>
                    ${latestExpHtml}
                </td>
                <td>
                    <div class="updated-cell">${updatedDate}</div>
                </td>
                <td>
                    <button class="btn btn-outline delete-btn" data-id="${cand.id}" title="Delete Candidate" style="color: #ff4d4f; border-color: transparent; padding: 4px 8px;">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;
            
            // Row click listener
            tr.addEventListener('click', (e) => {
                // If they clicked the anchor tag or the delete button, let them handle it
                if (e.target.closest('a.profile-link') || e.target.closest('.delete-btn')) {
                    return;
                }
                openModal(cand);
            });

            // Delete Event Listener
            const deleteBtn = tr.querySelector('.delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const titleSuffix = cand.jobTitle ? ` (${cand.jobTitle})` : '';
                    if (await showConfirm(`Are you sure you want to delete ${cand.fullName}${titleSuffix}?`)) {
                        deleteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                        const apiKey = apiKeyInput.value.trim() || 'syncup-dev-key';
                        const candidateId = cand._id || cand.id;
                        try {
                            const res = await fetch(`/api/candidates/${candidateId}`, {
                                method: 'DELETE',
                                headers: { 'x-api-key': apiKey }
                            });
                            if (res.ok) {
                                fetchCandidates(); // refresh the list
                            } else {
                                const data = await res.json();
                                alert('Failed to delete: ' + data.error);
                                deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
                            }
                        } catch (err) {
                            alert('Network error: ' + err.message);
                            deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
                        }
                    }
                });
            }

            listBody.appendChild(tr);
        });
    }

    // Modal Logic
    function openModal(cand) {
        modalPhoto.src = cand.photoUrl || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        modalName.innerText = cand.fullName || 'Unknown';
        modalHeadline.innerText = cand.jobTitle || 'No headline';
        modalLocation.innerText = cand.location || 'Unknown Location';
        
        // Render Experience
        modalExperience.innerHTML = '';
        if (cand.experience && cand.experience.length > 0) {
            cand.experience.forEach(exp => {
                modalExperience.innerHTML += `
                    <div class="modal-exp-item">
                        <div class="modal-exp-title">${escapeHtml(exp.title || '')}</div>
                        <div class="modal-exp-company">${escapeHtml(exp.company || '')}</div>
                        ${exp.duration ? `<div class="modal-exp-duration">${escapeHtml(exp.duration)}</div>` : ''}
                    </div>
                `;
            });
        } else {
            modalExperience.innerHTML = '<span class="text-muted">No experience data available.</span>';
        }

        // Render Raw JSON
        modalRaw.innerText = JSON.stringify(cand, null, 2);

        // Show Modal
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Prevent background scrolling

        // Handle Contact Info Display
        if (cand.email || cand.phone) {
            modalContactInfo.classList.remove('hidden');
            fetchContactBtn.classList.add('hidden');
            modalEmail.innerText = cand.email || 'No email found';
            modalPhone.innerText = cand.phone || 'No phone found';
        } else {
            modalContactInfo.classList.add('hidden');
            fetchContactBtn.classList.remove('hidden');
            modalEmail.innerText = '';
            modalPhone.innerText = '';
        }

        // Attach Candidate ID and Info to the fetch button
        fetchContactBtn.dataset.id = cand._id || cand.id;
        fetchContactBtn.dataset.name = cand.fullName;
        fetchContactBtn.dataset.company = cand.company;
        
        fetchMoreBtn.dataset.url = cand.linkedinUrl;
        fetchMoreBtn.dataset.name = cand.fullName;
        fetchMoreBtn.dataset.headline = cand.jobTitle;
        fetchMoreBtn.dataset.thumbnail = cand.photoUrl;
        fetchMoreBtn.dataset.location = cand.location;
    }

    function closeModal() {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    modalClose.addEventListener('click', closeModal);
    modalBackdrop.addEventListener('click', closeModal);

    // Tab Switching Logic
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.add('hidden'));
            
            btn.classList.add('active');
            const target = btn.dataset.target;
            document.getElementById(target).classList.remove('hidden');
        });
    });

    // Apply Filters
    function applyFilters() {
        const query = searchInput.value.toLowerCase();
        const titleVal = filterTitle.value.toLowerCase();
        const compVal = filterCompany.value.toLowerCase();
        const locVal = filterLocation.value.toLowerCase();

        const filtered = allCandidates.filter(c => {
            const matchesQuery = !query || 
                ((c.fullName || '').toLowerCase().includes(query) || 
                 (c.jobTitle || '').toLowerCase().includes(query) || 
                 (c.company || '').toLowerCase().includes(query) || 
                 (c.location || '').toLowerCase().includes(query));

            const matchesTitle = !titleVal || (c.jobTitle || '').toLowerCase().includes(titleVal);
            const matchesComp = !compVal || (c.company || '').toLowerCase().includes(compVal);
            const matchesLoc = !locVal || (c.location || '').toLowerCase().includes(locVal);

            return matchesQuery && matchesTitle && matchesComp && matchesLoc;
        });

        renderCandidates(filtered);
    }

    // Attach listeners
    searchInput.addEventListener('input', applyFilters);
    filterTitle.addEventListener('input', applyFilters);
    filterCompany.addEventListener('input', applyFilters);
    filterLocation.addEventListener('input', applyFilters);

    // Refresh Action
    refreshBtn.addEventListener('click', () => {
        refreshBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Refreshing';
        fetchCandidates().then(() => {
            refreshBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Refresh';
        });
    });

    // Fetch Contact Event Listener
    fetchContactBtn.addEventListener('click', async () => {
        const id = fetchContactBtn.dataset.id;
        const name = fetchContactBtn.dataset.name;
        const company = fetchContactBtn.dataset.company;
        const apiKey = apiKeyInput.value.trim() || 'syncup-dev-key';

        if (!name || !company) {
            alert("Candidate is missing a Name or Company. Cannot search Apollo API.");
            return;
        }

        fetchContactBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Fetching...';
        fetchContactBtn.disabled = true;

        try {
            const res = await fetch('/api/fetch-contact', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey
                },
                body: JSON.stringify({ id, name, company })
            });
            const data = await res.json();
            
            if (res.ok && data.success) {
                if (data.contact.email || data.contact.phone) {
                    modalContactInfo.classList.remove('hidden');
                    fetchContactBtn.classList.add('hidden');
                    modalEmail.innerText = data.contact.email || 'No email found';
                    modalPhone.innerText = data.contact.phone || 'No phone found';
                    fetchCandidates(); // Re-fetch all to update main list state
                } else {
                    alert("Hunter.io API could not find any contact info for this candidate.");
                    fetchContactBtn.innerHTML = '<i class="fa-solid fa-address-book"></i> Fetch Contact Info';
                }
            } else {
                alert('API Error: ' + (data.error || 'Unknown error'));
                fetchContactBtn.innerHTML = '<i class="fa-solid fa-address-book"></i> Fetch Contact Info';
            }
        } catch (e) {
            alert('Network Error: ' + e.message);
            fetchContactBtn.innerHTML = '<i class="fa-solid fa-address-book"></i> Fetch Contact Info';
        }
        fetchContactBtn.disabled = false;
    });

    fetchMoreBtn.addEventListener('click', async () => {
        const url = fetchMoreBtn.dataset.url;
        const name = fetchMoreBtn.dataset.name;
        const headline = fetchMoreBtn.dataset.headline;
        const thumbnail = fetchMoreBtn.dataset.thumbnail;
        const apiKey = apiKeyInput.value.trim() || 'syncup-dev-key';

        if (!url) {
            alert("No LinkedIn URL found for this candidate.");
            return;
        }

        fetchMoreBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Fetching...';
        fetchMoreBtn.disabled = true;

        try {
            const res = await fetch('/api/enrich-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
                body: JSON.stringify({ 
                    linkedinUrl: url,
                    fallbackData: { name, headline, thumbnail }
                })
            });
            const data = await res.json();
            
            if (res.ok && data.success) {
                alert("Successfully fetched from PDL!");
                fetchCandidates(); // Re-fetch all to update main list state
                closeModal();
            } else {
                alert('PDL Error: ' + (data.error || 'Unknown error'));
            }
        } catch (e) {
            alert('Network Error: ' + e.message);
        }
        
        fetchMoreBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Fetch More (PDL)';
        fetchMoreBtn.disabled = false;
    });

    // Manual Sourcing Logic
    const sourceResultContainer = document.getElementById('source-results-container');
    const sourceResultsList = document.getElementById('source-results-list');

    sourceFindBtn.addEventListener('click', async () => {
        const name = sourceName.value.trim();
        const company = sourceCompany.value.trim();
        const apiKey = apiKeyInput.value.trim() || 'syncup-dev-key';

        if (!name) {
            alert('Candidate Name is required for manual search.');
            return;
        }

        sourceFindBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Searching...';
        sourceFindBtn.disabled = true;
        sourceResultContainer.classList.add('hidden');
        sourceResultsList.innerHTML = '';

        try {
            const res = await fetch('/api/find', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
                body: JSON.stringify({ name, company })
            });
            const data = await res.json();

            if (res.ok && data.success && data.results && data.results.length > 0) {
                data.results.forEach((match, idx) => {
                    const card = document.createElement('div');
                    card.style.cssText = 'border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; background: var(--bg-secondary);';
                    
                    card.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                            <div style="display: flex; gap: 12px; flex: 1;">
                                ${match.thumbnail ? `<img src="${escapeHtml(match.thumbnail)}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0;" onerror="this.style.display='none'">` : `<div style="width: 40px; height: 40px; border-radius: 50%; background: var(--bg-color); display: flex; align-items: center; justify-content: center; color: var(--text-muted); flex-shrink: 0;"><i class="fa-solid fa-user"></i></div>`}
                                <div>
                                    <a href="${match.linkedinUrl}" target="_blank" style="color: var(--primary-color); font-weight: 600; font-size: 0.95rem; text-decoration: none; display: block; margin-bottom: 4px;">${escapeHtml(match.title)}</a>
                                    <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${escapeHtml(match.snippet)}</p>
                                </div>
                            </div>
                            <button id="enrich-btn-${idx}" class="btn" style="padding: 6px 12px; font-size: 0.8rem; white-space: nowrap; width: auto;">
                                <i class="fa-solid fa-cloud-arrow-down"></i> Save Profile
                            </button>
                        </div>
                    `;
                    sourceResultsList.appendChild(card);

                    // Add click listener for this specific result
                    document.getElementById(`enrich-btn-${idx}`).addEventListener('click', async (e) => {
                        const btn = e.currentTarget;
                        btn.disabled = true;
                        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';

                        try {
                            const enrichRes = await fetch('/api/enrich-url', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
                                body: JSON.stringify({ 
                                    linkedinUrl: match.linkedinUrl,
                                    fallbackData: {
                                        name: match.title,
                                        headline: match.snippet,
                                        thumbnail: match.thumbnail
                                    }
                                })
                            });
                            const enrichData = await enrichRes.json();

                            if (enrichRes.ok && enrichData.success) {
                                btn.innerHTML = '<i class="fa-solid fa-check"></i> Saved!';
                                btn.style.backgroundColor = 'var(--success-color)';
                                if (enrichData.fallback) {
                                    showToast('PDL could not find the profile. Saved a basic skeleton profile instead.', 'warning');
                                } else {
                                    showToast('Profile enriched and saved successfully!', 'success');
                                }
                                fetchCandidates(); // Refresh the dashboard
                            } else {
                                alert('PDL Error: ' + (enrichData.error || 'Failed to enrich.'));
                                btn.disabled = false;
                                btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Save Profile';
                            }
                        } catch (err) {
                            alert('Network Error: ' + err.message);
                            btn.disabled = false;
                            btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Save Profile';
                        }
                    });
                });

                sourceResultContainer.classList.remove('hidden');
            } else {
                alert('Search Error: ' + (data.error || 'No profiles found.'));
            }
        } catch (e) {
            alert('Network Error: ' + e.message);
        }

        sourceFindBtn.innerHTML = 'Find LinkedIn';
        sourceFindBtn.disabled = false;
    });

    // Utility to prevent XSS in rendering
    function escapeHtml(unsafe) {
        return (unsafe || '').toString()
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }

    // Initial load
    fetchCandidates();
});
