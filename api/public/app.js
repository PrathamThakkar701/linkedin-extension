document.addEventListener('DOMContentLoaded', () => {
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
                renderCandidates(allCandidates);
            } else {
                showError('Authentication Failed', data.error || 'Invalid API Key');
                allCandidates = [];
                renderCandidates([]);
            }
        } catch (e) {
            showError('Network Error', e.message);
            allCandidates = [];
            renderCandidates([]);
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
                    <div class="user-location">${escapeHtml(cand.location || '-')}</div>
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
                    if (confirm(`Are you sure you want to delete ${cand.fullName}?`)) {
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
    }

    function closeModal() {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    modalClose.addEventListener('click', closeModal);
    modalBackdrop.addEventListener('click', closeModal);

    // Search Filtering
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        if (!query) {
            renderCandidates(allCandidates);
            return;
        }

        const filtered = allCandidates.filter(c => {
            const nameMatch = (c.fullName || '').toLowerCase().includes(query);
            const titleMatch = (c.jobTitle || '').toLowerCase().includes(query);
            const compMatch = (c.company || '').toLowerCase().includes(query);
            const locMatch = (c.location || '').toLowerCase().includes(query);
            return nameMatch || titleMatch || compMatch || locMatch;
        });

        renderCandidates(filtered);
    });

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
                    alert("Apollo API could not find any contact info for this candidate.");
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

    // Manual Sourcing Logic
    let currentFoundUrl = '';

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
        sourceResult.classList.add('hidden');

        try {
            const res = await fetch('/api/find', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
                body: JSON.stringify({ name, company })
            });
            const data = await res.json();

            if (res.ok && data.success) {
                currentFoundUrl = data.linkedinUrl;
                sourceLink.href = currentFoundUrl;
                sourceOpenBtn.href = currentFoundUrl;
                sourceResult.classList.remove('hidden');
                
                // Reset enrich button state
                sourceEnrichBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Auto-Save via RapidAPI';
                sourceEnrichBtn.disabled = false;
            } else {
                alert('Search Error: ' + (data.error || 'Profile not found.'));
            }
        } catch (e) {
            alert('Network Error: ' + e.message);
        }

        sourceFindBtn.innerHTML = 'Find LinkedIn';
        sourceFindBtn.disabled = false;
    });

    sourceEnrichBtn.addEventListener('click', async () => {
        if (!currentFoundUrl) return;
        
        const apiKey = apiKeyInput.value.trim() || 'syncup-dev-key';
        
        sourceEnrichBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
        sourceEnrichBtn.disabled = true;

        try {
            const res = await fetch('/api/enrich-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
                body: JSON.stringify({ linkedinUrl: currentFoundUrl })
            });
            const data = await res.json();

            if (res.ok && data.success) {
                sourceEnrichBtn.innerHTML = '<i class="fa-solid fa-check"></i> Saved!';
                fetchCandidates(); // Refresh the dashboard list
            } else {
                alert('RapidAPI Error: ' + (data.error || 'Failed to enrich.'));
                sourceEnrichBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Auto-Save via RapidAPI';
                sourceEnrichBtn.disabled = false;
            }
        } catch (e) {
            alert('Network Error: ' + e.message);
            sourceEnrichBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Auto-Save via RapidAPI';
            sourceEnrichBtn.disabled = false;
        }
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
