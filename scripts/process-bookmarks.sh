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

# Get OpenRouter API key for summarization (optional but recommended)
OPENROUTER_API_KEY=$(security find-generic-password -s "openrouter-api-key" -w 2>/dev/null || echo "")

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
    # Still regenerate index in case files were added/changed manually
fi

# Process each item using Python
source "$VENV_DIR/bin/activate"

export TOKEN
export GIST_ID
export OPENROUTER_API_KEY

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
OPENROUTER_API_KEY = os.environ.get('OPENROUTER_API_KEY', '')

def log(msg):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)

def slugify(text):
    """Convert text to URL-friendly slug."""
    text = text.lower()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[-\s]+', '-', text)
    return text[:50].strip('-')

def generate_summary(content, title):
    """Generate a 2-3 sentence summary using OpenRouter API."""
    if not OPENROUTER_API_KEY:
        log("  No OpenRouter API key, skipping summary")
        return ""
    
    try:
        # Truncate content if too long (keep first ~4000 chars for context)
        truncated = content[:4000] if len(content) > 4000 else content
        
        response = requests.post(
            'https://openrouter.ai/api/v1/chat/completions',
            headers={
                'Authorization': f'Bearer {OPENROUTER_API_KEY}',
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://github.com/openclaw',
                'X-Title': 'Bookmark Keeper'
            },
            json={
                'model': 'anthropic/claude-3-haiku',
                'max_tokens': 150,
                'messages': [
                    {
                        'role': 'user',
                        'content': f'Summarize this article in 2-3 sentences. Be specific and informative, not generic.\n\nTitle: {title}\n\nContent:\n{truncated}'
                    }
                ]
            },
            timeout=30
        )
        response.raise_for_status()
        result = response.json()
        summary = result.get('choices', [{}])[0].get('message', {}).get('content', '').strip()
        return summary
    except Exception as e:
        log(f"  Warning: Could not generate summary: {e}")
        return ""

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
    
    # Generate summary
    summary = generate_summary(content, title)
    if summary:
        log(f"  Generated summary: {summary[:50]}...")
    
    # Escape summary for YAML
    summary_escaped = summary.replace('"', '\\"').replace('\n', ' ')
    
    # Build frontmatter
    frontmatter = f'''---
title: "{title.replace('"', '\\"')}"
url: {url}
saved: {date_str}
note: {f'"{note}"' if note else 'null'}
tags: []
summary: "{summary_escaped}"
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

def generate_index():
    """Generate INDEX.md from all bookmark files."""
    log("Generating INDEX.md...")
    
    import glob
    from collections import defaultdict
    
    # Find all markdown files (excluding INDEX.md)
    md_files = glob.glob(os.path.join(BOOKMARKS_DIR, '*.md'))
    md_files = [f for f in md_files if not f.endswith('INDEX.md')]
    
    if not md_files:
        log("  No bookmark files found")
        return
    
    # Parse each file and extract metadata
    bookmarks_by_date = defaultdict(list)
    
    for filepath in md_files:
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Parse YAML frontmatter
            if content.startswith('---'):
                parts = content.split('---', 2)
                if len(parts) >= 3:
                    frontmatter = parts[1].strip()
                    
                    # Simple YAML parsing
                    title = ''
                    saved = ''
                    summary = ''
                    
                    for line in frontmatter.split('\n'):
                        if line.startswith('title:'):
                            title = line[6:].strip().strip('"')
                        elif line.startswith('saved:'):
                            saved = line[6:].strip()
                        elif line.startswith('summary:'):
                            summary = line[8:].strip().strip('"')
                    
                    if saved and title:
                        filename = os.path.basename(filepath)
                        bookmarks_by_date[saved].append({
                            'title': title,
                            'filename': filename,
                            'summary': summary
                        })
        except Exception as e:
            log(f"  Warning: Could not parse {filepath}: {e}")
    
    # Generate INDEX.md content
    today = datetime.now().strftime('%Y-%m-%d')
    index_content = f"# Bookmark Index\n\n*Last updated: {today}*\n\n"
    
    # Sort dates descending (newest first)
    for date in sorted(bookmarks_by_date.keys(), reverse=True):
        index_content += f"## {date}\n\n"
        for bm in bookmarks_by_date[date]:
            summary_text = f" — {bm['summary']}" if bm['summary'] else ""
            # Truncate long summaries for the index
            if len(summary_text) > 150:
                summary_text = summary_text[:147] + "..."
            index_content += f"- [{bm['title']}](./{bm['filename']}){summary_text}\n"
        index_content += "\n"
    
    # Write INDEX.md
    index_path = os.path.join(BOOKMARKS_DIR, 'INDEX.md')
    with open(index_path, 'w', encoding='utf-8') as f:
        f.write(index_content)
    
    log(f"  Generated INDEX.md with {sum(len(v) for v in bookmarks_by_date.values())} bookmarks")

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
    
    # Always regenerate index after processing
    generate_index()

if __name__ == '__main__':
    main()
PYTHON_SCRIPT

deactivate 2>/dev/null || true

log "=== Bookmark processing complete ==="
