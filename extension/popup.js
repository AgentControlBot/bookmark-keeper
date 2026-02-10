// Default Gist ID - can be overridden in settings
const DEFAULT_GIST_ID = 'd37553e2f87fd4d73381ac88c147da1c';
const GIST_FILENAME = 'bookmark-queue.json';

// DOM elements
const saveBtn = document.getElementById('save-btn');
const statusDiv = document.getElementById('status');
const pageTitleDiv = document.getElementById('page-title');
const pageUrlDiv = document.getElementById('page-url');
const selectionIndicator = document.getElementById('selection-indicator');
const selectionCharsSpan = document.getElementById('selection-chars');
const noteTextarea = document.getElementById('note');
const tokenInput = document.getElementById('token');
const gistIdInput = document.getElementById('gist-id');
const saveSettingsBtn = document.getElementById('save-settings');

// Current page data
let currentTab = null;
let currentSelection = null;

// Show status message
function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = type;
  
  // Auto-clear success messages
  if (type === 'success') {
    setTimeout(() => {
      statusDiv.textContent = '';
      statusDiv.className = '';
    }, 3000);
  }
}

// Get current tab info
async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Get selected text from the page
async function getSelectedText(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => window.getSelection().toString()
    });
    return results?.[0]?.result || null;
  } catch (error) {
    console.log('Could not get selection:', error);
    return null;
  }
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
    
    // Get note text
    const note = noteTextarea.value.trim() || null;
    
    // Create bookmark object
    const bookmark = {
      url: currentTab.url,
      title: currentTab.title,
      selection: currentSelection,
      note: note,
      timestamp: new Date().toISOString()
    };
    
    // Get current Gist content, append, and update
    const bookmarks = await getGistContent(token, gistId);
    bookmarks.push(bookmark);
    await updateGistContent(token, gistId, bookmarks);
    
    showStatus('✓ Saved!', 'success');
    
    // Clear the note field after saving
    noteTextarea.value = '';
  } catch (error) {
    console.error('Error saving bookmark:', error);
    showStatus(`Error: ${error.message}`, 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

// Truncate URL for display
function truncateUrl(url, maxLength = 50) {
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength - 3) + '...';
}

// Initialize popup
async function init() {
  // Load settings
  await loadSettings();
  
  // Get current tab info
  currentTab = await getCurrentTab();
  pageTitleDiv.textContent = currentTab.title || 'Unknown page';
  pageUrlDiv.textContent = truncateUrl(currentTab.url || '');
  pageUrlDiv.title = currentTab.url; // Full URL on hover
  
  // Try to get selected text
  currentSelection = await getSelectedText(currentTab.id);
  if (currentSelection && currentSelection.trim()) {
    currentSelection = currentSelection.trim();
    selectionIndicator.classList.add('visible');
    selectionCharsSpan.textContent = currentSelection.length;
  } else {
    currentSelection = null;
  }
  
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
