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
            `;
            
            // Row click listener
            tr.addEventListener('click', (e) => {
                // If they clicked the anchor tag, let the browser handle it
                if (e.target.closest('a.profile-link')) {
                    return;
                }
                openModal(cand);
            });

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
