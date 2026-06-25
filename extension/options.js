// Saves options to chrome.storage
const saveOptions = () => {
  const apiUrl = document.getElementById('apiUrl').value;
  const apiKey = document.getElementById('apiKey').value;

  chrome.storage.sync.set(
    { apiUrl, apiKey },
    () => {
      // Update status to let user know options were saved.
      const status = document.getElementById('status');
      status.textContent = 'Options saved.';
      setTimeout(() => {
        status.textContent = '';
      }, 2000);
    }
  );
};

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
const restoreOptions = () => {
  chrome.storage.sync.get(
    { apiUrl: 'https://linkedin-extension-ten.vercel.app', apiKey: 'syncup-dev-key' },
    (items) => {
      document.getElementById('apiUrl').value = items.apiUrl;
      document.getElementById('apiKey').value = items.apiKey;
    }
  );
};

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('saveBtn').addEventListener('click', saveOptions);
