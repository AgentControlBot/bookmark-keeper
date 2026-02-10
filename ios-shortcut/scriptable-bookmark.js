// Bookmark Keeper for Scriptable
// Save pages to GitHub Gist queue (same as Chrome extension)
//
// SETUP:
// 1. Install Scriptable from App Store
// 2. Create new script, paste this code
// 3. Replace YOUR_GITHUB_TOKEN with your token
// 4. Create a Shortcut that runs this script via Share Sheet

// ========== CONFIGURATION ==========
const GITHUB_TOKEN = 'YOUR_GITHUB_TOKEN_HERE';
const GIST_ID = 'd37553e2f87fd4d73381ac88c147da1c';
const GIST_FILENAME = 'bookmark-queue.json';
// ====================================

async function main() {
  // Get shared URL from Share Sheet
  let url, title;
  
  if (args.urls && args.urls.length > 0) {
    url = args.urls[0];
    title = url; // Will try to get better title below
  } else if (args.plainTexts && args.plainTexts.length > 0) {
    // Maybe a URL was shared as plain text
    const text = args.plainTexts[0];
    if (text.startsWith('http')) {
      url = text;
      title = text;
    } else {
      await showError('No URL found. Share a webpage to save it.');
      return;
    }
  } else {
    await showError('No URL found. Share a webpage to save it.');
    return;
  }
  
  // Try to get page title from Share Sheet
  if (args.widgetParameter) {
    title = args.widgetParameter;
  }
  
  // Ask for optional note
  let note = null;
  const alert = new Alert();
  alert.title = 'Save Bookmark';
  alert.message = truncate(title, 100) + '\n\n' + truncate(url, 60);
  alert.addTextField('Add a note (optional)', '');
  alert.addAction('Save');
  alert.addCancelAction('Cancel');
  
  const response = await alert.present();
  if (response === -1) {
    return; // Cancelled
  }
  
  note = alert.textFieldValue(0).trim() || null;
  
  // Create bookmark object
  const bookmark = {
    url: url,
    title: title,
    selection: null,
    note: note,
    timestamp: new Date().toISOString(),
    source: 'ios-shortcut'
  };
  
  try {
    // Fetch existing gist content
    const existingBookmarks = await fetchGist();
    
    // Append new bookmark
    existingBookmarks.push(bookmark);
    
    // Update gist
    await updateGist(existingBookmarks);
    
    // Success notification
    const notification = new Notification();
    notification.title = '✓ Bookmark Saved';
    notification.body = truncate(title, 50);
    notification.sound = 'default';
    await notification.schedule();
    
  } catch (error) {
    await showError('Failed to save: ' + error.message);
  }
}

async function fetchGist() {
  const req = new Request(`https://api.github.com/gists/${GIST_ID}`);
  req.headers = {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json'
  };
  
  const response = await req.loadJSON();
  
  if (response.message) {
    throw new Error(response.message);
  }
  
  const content = response.files[GIST_FILENAME]?.content || '[]';
  return JSON.parse(content);
}

async function updateGist(bookmarks) {
  const req = new Request(`https://api.github.com/gists/${GIST_ID}`);
  req.method = 'PATCH';
  req.headers = {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Content-Type': 'application/json',
    'Accept': 'application/vnd.github.v3+json'
  };
  req.body = JSON.stringify({
    files: {
      [GIST_FILENAME]: {
        content: JSON.stringify(bookmarks, null, 2)
      }
    }
  });
  
  const response = await req.loadJSON();
  
  if (response.message) {
    throw new Error(response.message);
  }
  
  return response;
}

function truncate(str, maxLength) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

async function showError(message) {
  const alert = new Alert();
  alert.title = 'Error';
  alert.message = message;
  alert.addAction('OK');
  await alert.present();
}

// Run
await main();
Script.complete();
