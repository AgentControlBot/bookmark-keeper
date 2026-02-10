# Bookmark Keeper

A Chrome extension that captures web pages to a GitHub Gist queue, processed by a cron job into summarized markdown files.

## Architecture

```
Chrome Extension ──POST──▶ GitHub Gist (JSON queue) ◀──POLL── Processing Script (cron)
                                                                      │
                                                                      ▼
                                                        ~/clawd/workspace/bookmarks/
                                                        ├── 2026-02-09-some-article.md
                                                        └── INDEX.md
```

## Components

### Chrome Extension (`extension/`)

- **manifest.json** - Manifest V3 extension config
- **popup.html/js** - UI for saving pages with optional notes
- **icons/** - Extension icons

Features:
- Save URL, title, and timestamp to GitHub Gist
- Capture text selection from the page
- Add optional notes about why you're saving
- Visual indicator for captured selection

### Processing Script (`scripts/process-bookmarks.sh`)

Located at: `~/clawd/scripts/process-bookmarks.sh`

Features:
- Fetches queued bookmarks from GitHub Gist
- Downloads and converts page content to markdown
- Generates AI summaries (via OpenRouter/Claude)
- Saves to `~/clawd/workspace/bookmarks/`
- Generates INDEX.md with all bookmarks
- Removes processed items from queue

### Cron Job

Runs every 15 minutes via OpenClaw cron:
```
openclaw cron list | grep bookmark
```

## Setup

### Prerequisites

1. **GitHub Token** with `gist` scope, stored in Keychain:
   ```bash
   security add-generic-password -s "github-gist-token" -a "$(whoami)" -w "YOUR_TOKEN"
   ```

2. **OpenRouter API Key** for summarization (optional):
   ```bash
   security add-generic-password -s "openrouter-api-key" -w "YOUR_KEY"
   ```

3. **Python virtual environment** for processing:
   ```bash
   python3 -m venv ~/clawd/scripts/.bookmark-venv
   source ~/clawd/scripts/.bookmark-venv/bin/activate
   pip install html2text beautifulsoup4 requests
   ```

### Install Extension

1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/` folder

### Configure Extension

1. Click the extension icon
2. Expand Settings
3. Enter your GitHub token
4. Gist ID is pre-configured (or enter your own)

## Output Format

Each saved bookmark creates a markdown file with YAML frontmatter:

```markdown
---
title: "Article Title"
url: https://example.com/article
saved: 2026-02-09
note: "Why I saved this..."
tags: []
summary: "AI-generated 2-3 sentence summary..."
---

# Article Title

[Full markdown content here]
```

## Gist Details

- **Gist ID:** `d37553e2f87fd4d73381ac88c147da1c`
- **File:** `bookmark-queue.json`
- **Format:** JSON array of bookmark objects

## Files

```
~/Projects/bookmark-keeper/
├── extension/
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   └── icons/
├── scripts/
│   └── process-bookmarks.sh
├── BUILD-PLAN.md
└── README.md

~/clawd/scripts/
└── process-bookmarks.sh  (active copy)

~/clawd/workspace/bookmarks/
├── INDEX.md
├── processing.log
└── *.md (saved bookmarks)
```

## Manual Processing

To process bookmarks immediately:
```bash
~/clawd/scripts/process-bookmarks.sh
```

## License

MIT
