// Default Gist ID - can be overridden in settings
const DEFAULT_GIST_ID = 'd37553e2f87fd4d73381ac88c147da1c';
const GIST_FILENAME = 'bookmark-queue.json';

// DOM elements
const saveBtn = document.getElementById('save-btn');
const statusDiv = document.getElementById('status');
const pageTitleDiv = document.getElementById('page-title');
const tokenInput = document.getElementById('token');
const gistIdInput = document.getElementById('gist-id');
const saveSettingsBtn = document.getElementById('save-settings');

// Show status message
function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = type;
}

// Get current tab info
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Load settings from storage
async function loadSettings() {
  const result = await chrome.storage.local.get(['githubToken', 'gistId']);
  if (result.githubToken) {
    tokenInput.value = result.githubToken;
  }
  if (result.gistId) {
    gistIdInput.value = result.gistId;
  } else {
    gistIdInput.value = DEFAULT_GIST_ID;
  }
}

// Save settings to storage
async function saveSettings() {
  const token = tokenInput.value.trim();
  const gistId = gistIdInput.value.trim();
  
  if (!token) {
    showStatus('Please enter a GitHub token', 'error');
    return;
  }
  if (!gistId) {
    showStatus('Please enter a Gist ID', 'error');
    return;
  }
  
  await chrome.storage.local.set({ 
    githubToken: token,
    gistId: gistId
  });
  showStatus('Settings saved!', 'success');
}

// Get Gist content
async function getGistContent(token, gistId) {
  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch Gist: ${response.status}`);
  }
  
  const gist = await response.json();
  const fileContent = gist.files[GIST_FILENAME]?.content || '[]';
  return JSON.parse(fileContent);
}

// Update Gist content
async function updateGistContent(token, gistId, bookmarks) {
  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json'
    },
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(bookmarks, null, 2)
        }
      }
    })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to update Gist: ${response.status}`);
  }
  
  return response.json();
}

// Save current page to Gist
async function savePage() {
  try {
    saveBtn.disabled = true;
    showStatus('Saving...', 'loading');
    
    // Get settings
    const result = await chrome.storage.local.get(['githubToken', 'gistId']);
    const token = result.githubToken;
    const gistId = result.gistId || DEFAULT_GIST_ID;
    
    if (!token) {
      showStatus('Please configure GitHub token in settings', 'error');
      saveBtn.disabled = false;
      return;
    }
    
    // Get current tab
    const tab = await getCurrentTab();
    
    // Create bookmark object
    const bookmark = {
      url: tab.url,
      title: tab.title,
      selection: null,  // Will be added in Milestone 5
      note: null,       // Will be added in Milestone 5
      timestamp: new Date().toISOString()
    };
    
    // Get current Gist content, append, and update
    const bookmarks = await getGistContent(token, gistId);
    bookmarks.push(bookmark);
    await updateGistContent(token, gistId, bookmarks);
    
    showStatus('✓ Saved!', 'success');
  } catch (error) {
    console.error('Error saving bookmark:', error);
    showStatus(`Error: ${error.message}`, 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

// Initialize popup
async function init() {
  // Load settings
  await loadSettings();
  
  // Display current page title
  const tab = await getCurrentTab();
  pageTitleDiv.textContent = tab.title || 'Unknown page';
  
  // Check if token is configured
  const result = await chrome.storage.local.get(['githubToken']);
  if (!result.githubToken) {
    showStatus('⚠️ Configure GitHub token below', 'error');
  }
}

// Event listeners
saveBtn.addEventListener('click', savePage);
saveSettingsBtn.addEventListener('click', saveSettings);

// Initialize on load
init();
