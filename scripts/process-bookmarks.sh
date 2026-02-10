#!/usr/bin/env bash
set -euo pipefail

# Configuration
GIST_ID="d37553e2f87fd4d73381ac88c147da1c"
GIST_FILENAME="bookmark-queue.json"
BOOKMARKS_DIR="${HOME}/clawd/workspace/bookmarks"
LOGFILE="${BOOKMARKS_DIR}/processing.log"
VENV_DIR="${HOME}/clawd/scripts/.bookmark-venv"

# Get GitHub token from keychain
TOKEN=$(security find-generic-password -s "github-gist-token" -a "$(whoami)" -w 2>/dev/null)
if [[ -z "$TOKEN" ]]; then
    echo "ERROR: GitHub token not found in keychain" | tee -a "$LOGFILE"
    exit 1
fi

# Ensure directories exist
mkdir -p "$BOOKMARKS_DIR"

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOGFILE"
}

log "=== Starting bookmark processing ==="

# Fetch current Gist content
GIST_RESPONSE=$(curl -sL \
    -H "Authorization: token $TOKEN" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/gists/$GIST_ID")

# Extract the file content
QUEUE_CONTENT=$(echo "$GIST_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
content = data.get('files', {}).get('$GIST_FILENAME', {}).get('content', '[]')
print(content)
")

# Parse queue and count items
ITEM_COUNT=$(echo "$QUEUE_CONTENT" | python3 -c "import sys, json; print(len(json.load(sys.stdin)))")
log "Found $ITEM_COUNT items in queue"

if [[ "$ITEM_COUNT" -eq 0 ]]; then
    log "No items to process"
    exit 0
fi

# Process each item using Python
source "$VENV_DIR/bin/activate"

export TOKEN
export GIST_ID

python3 << 'PYTHON_SCRIPT'
import json
import os
import re
import sys
from datetime import datetime
import requests
from bs4 import BeautifulSoup
import html2text

# Configuration
GIST_ID = os.environ.get('GIST_ID', 'd37553e2f87fd4d73381ac88c147da1c')
GIST_FILENAME = 'bookmark-queue.json'
BOOKMARKS_DIR = os.path.expanduser('~/clawd/workspace/bookmarks')
TOKEN = os.environ.get('TOKEN')

def log(msg):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)

def slugify(text):
    """Convert text to URL-friendly slug."""
    text = text.lower()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[-\s]+', '-', text)
    return text[:50].strip('-')

def fetch_page_content(url):
    """Fetch and extract main content from URL."""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Remove script and style elements
        for script in soup(["script", "style", "nav", "footer", "header", "aside"]):
            script.decompose()
        
        # Try to find main content
        main_content = (
            soup.find('article') or 
            soup.find('main') or 
            soup.find(class_=re.compile(r'(content|article|post|entry)')) or
            soup.find('body')
        )
        
        if main_content:
            # Convert to markdown
            h = html2text.HTML2Text()
            h.ignore_links = False
            h.ignore_images = False
            h.body_width = 0  # No wrapping
            markdown = h.handle(str(main_content))
            return markdown.strip()
        
        return None
    except Exception as e:
        log(f"Error fetching {url}: {e}")
        return None

def get_gist_content():
    """Fetch current Gist queue."""
    response = requests.get(
        f'https://api.github.com/gists/{GIST_ID}',
        headers={
            'Authorization': f'token {TOKEN}',
            'Accept': 'application/vnd.github.v3+json'
        }
    )
    response.raise_for_status()
    gist = response.json()
    content = gist.get('files', {}).get(GIST_FILENAME, {}).get('content', '[]')
    return json.loads(content)

def update_gist_content(bookmarks):
    """Update Gist with new content."""
    response = requests.patch(
        f'https://api.github.com/gists/{GIST_ID}',
        headers={
            'Authorization': f'token {TOKEN}',
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json'
        },
        json={
            'files': {
                GIST_FILENAME: {
                    'content': json.dumps(bookmarks, indent=2)
                }
            }
        }
    )
    response.raise_for_status()

def remove_item_from_gist(url, timestamp):
    """Remove a specific item from the Gist queue."""
    # Re-fetch to get latest state (handles race conditions)
    bookmarks = get_gist_content()
    # Find and remove the matching item
    bookmarks = [b for b in bookmarks if not (b.get('url') == url and b.get('timestamp') == timestamp)]
    update_gist_content(bookmarks)

def process_bookmark(bookmark):
    """Process a single bookmark."""
    url = bookmark.get('url')
    title = bookmark.get('title', 'Untitled')
    note = bookmark.get('note')
    selection = bookmark.get('selection')
    timestamp = bookmark.get('timestamp', datetime.now().isoformat())
    
    log(f"Processing: {title[:50]}...")
    
    # Parse date from timestamp
    try:
        dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        date_str = dt.strftime('%Y-%m-%d')
    except:
        date_str = datetime.now().strftime('%Y-%m-%d')
    
    # Create filename
    slug = slugify(title)
    filename = f"{date_str}-{slug}.md"
    filepath = os.path.join(BOOKMARKS_DIR, filename)
    
    # Fetch content
    content = fetch_page_content(url)
    if not content:
        content = f"*Failed to fetch content from {url}*"
        log(f"  Warning: Could not fetch content")
    
    # Build frontmatter
    frontmatter = f'''---
title: "{title.replace('"', '\\"')}"
url: {url}
saved: {date_str}
note: {f'"{note}"' if note else 'null'}
tags: []
summary: ""
---

'''
    
    # Build full content
    full_content = frontmatter + f"# {title}\n\n"
    if selection:
        full_content += f"> {selection}\n\n"
    full_content += content
    
    # Write file
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(full_content)
    
    log(f"  Saved to: {filename}")
    return True

def main():
    bookmarks = get_gist_content()
    processed = 0
    failed = 0
    
    for bookmark in bookmarks[:]:  # Copy list to iterate
        url = bookmark.get('url')
        timestamp = bookmark.get('timestamp')
        
        try:
            if process_bookmark(bookmark):
                # Remove from Gist after successful processing
                remove_item_from_gist(url, timestamp)
                processed += 1
        except Exception as e:
            log(f"Error processing bookmark: {e}")
            failed += 1
    
    log(f"Completed: {processed} processed, {failed} failed")

if __name__ == '__main__':
    main()
PYTHON_SCRIPT

deactivate 2>/dev/null || true

log "=== Bookmark processing complete ==="
