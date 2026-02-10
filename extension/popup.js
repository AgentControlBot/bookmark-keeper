// Default Gist ID - can be overridden in settings
const DEFAULT_GIST_ID = 'd37553e2f87fd4d73381ac88c147da1c';
const GIST_FILENAME = 'bookmark-queue.json';

// Lucide icon paths
const ICONS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  alertCircle: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>'
};

// DOM elements
const saveBtn = document.getElementById('save-btn');
const saveBtnText = saveBtn.querySelector('.btn-text');
const saveIcon = saveBtn.querySelector('.icon-save');
const loadingIcon = saveBtn.querySelector('.icon-loading');
const statusDiv = document.getElementById('status');
const statusIcon = statusDiv.querySelector('.status-icon');
const statusText = statusDiv.querySelector('.status-text');
const pageTitleDiv = document.getElementById('page-title');
const pageUrlDiv = document.getElementById('page-url');
const selectionIndicator = document.getElementById('selection-indicator');
const selectionCharsSpan = document.getElementById('selection-chars');
const noteTextarea = document.getElementById('note');
const tokenInput = document.getElementById('token');
const gistIdInput = document.getElementById('gist-id');
const saveSettingsBtn = document.getElementById('save-settings');
const themeToggle = document.getElementById('theme-toggle');
const moonIcon = themeToggle.querySelector('.icon-moon');
const sunIcon = themeToggle.querySelector('.icon-sun');

// Current page data
let currentTab = null;
let currentSelection = null;

// Theme handling
function setTheme(dark) {
  if (dark) {
    document.body.classList.add('dark');
    moonIcon.style.display = 'none';
    sunIcon.style.display = 'block';
  } else {
    document.body.classList.remove('dark');
    moonIcon.style.display = 'block';
    sunIcon.style.display = 'none';
  }
  chrome.storage.local.set({ darkTheme: dark });
}

async function loadTheme() {
  const result = await chrome.storage.local.get(['darkTheme']);
  // Default to system preference if not set
  if (result.darkTheme === undefined) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(prefersDark);
  } else {
    setTheme(result.darkTheme);
  }
}

themeToggle.addEventListener('click', () => {
  const isDark = document.body.classList.contains('dark');
  setTheme(!isDark);
});

// Show status message
function showStatus(message, type) {
  statusText.textContent = message;
  statusDiv.className = `visible ${type}`;
  
  // Set appropriate icon
  if (type === 'success') {
    statusIcon.innerHTML = ICONS.check;
  } else if (type === 'error') {
    statusIcon.innerHTML = ICONS.alertCircle;
  } else if (type === 'loading') {
    statusIcon.innerHTML = ICONS.loader;
    statusIcon.classList.add('spinner');
  }
  
  if (type !== 'loading') {
    statusIcon.classList.remove('spinner');
  }
  
  // Auto-clear success messages
  if (type === 'success') {
    setTimeout(() => {
      statusDiv.className = '';
    }, 3000);
  }
}

function hideStatus() {
  statusDiv.className = '';
}

// Set button loading state
function setButtonLoading(loading) {
  saveBtn.disabled = loading;
  if (loading) {
    saveIcon.style.display = 'none';
    loadingIcon.style.display = 'block';
    saveBtnText.textContent = 'Saving...';
  } else {
    saveIcon.style.display = 'block';
    loadingIcon.style.display = 'none';
    saveBtnText.textContent = 'Save Page';
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
  showStatus('Settings saved', 'success');
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
    setButtonLoading(true);
    showStatus('Saving...', 'loading');
    
    // Get settings
    const result = await chrome.storage.local.get(['githubToken', 'gistId']);
    const token = result.githubToken;
    const gistId = result.gistId || DEFAULT_GIST_ID;
    
    if (!token) {
      showStatus('Configure GitHub token in settings', 'error');
      setButtonLoading(false);
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
    
    showStatus('Saved', 'success');
    
    // Clear the note field after saving
    noteTextarea.value = '';
  } catch (error) {
    console.error('Error saving bookmark:', error);
    showStatus(error.message, 'error');
  } finally {
    setButtonLoading(false);
  }
}

// Truncate URL for display
function truncateUrl(url, maxLength = 50) {
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength - 3) + '...';
}

// Initialize popup
async function init() {
  // Load theme first
  await loadTheme();
  
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
    selectionCharsSpan.textContent = currentSelection.length.toLocaleString();
  } else {
    currentSelection = null;
  }
  
  // Check if token is configured
  const result = await chrome.storage.local.get(['githubToken']);
  if (!result.githubToken) {
    showStatus('Configure GitHub token below', 'error');
  }
}

// Event listeners
saveBtn.addEventListener('click', savePage);
saveSettingsBtn.addEventListener('click', saveSettings);

// Initialize on load
init();
