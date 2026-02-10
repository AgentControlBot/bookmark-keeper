# Bookmark Keeper — Build Instructions

> **For:** OpenClaw agent (main)
> **Workspace:** `~/clawd/workspace/bookmarks/` (output) + new Chrome extension + processing script
> **Estimated effort:** ~8 hours across 6 milestones
> **Checkpoint protocol:** Commit after each milestone. Do not proceed if the gate fails.

---

## Project Overview

Build a Chrome extension that captures web pages to a GitHub Gist queue, processed by a cron job on this Mac Mini into summarized markdown files.

```
Chrome Extension ──POST──▶ GitHub Gist (JSON queue) ◀──POLL── Processing Script (cron)
                                                                      │
                                                                      ▼
                                                        ~/clawd/workspace/bookmarks/
                                                        ├── 2026-02-09-some-article.md
                                                        └── INDEX.md
```

---

## Before You Start

### Environment Context

- **OS:** macOS, Mac Mini
- **Config directory:** `~/.openclaw/` (migrated from `~/.clawdbot/`)
- **Config file:** `openclaw.json`
- **CLI command:** `openclaw` (not `clawdbot`)
- **Gateway:** Running on `127.0.0.1:18789`, WebSocket-only API (no HTTP REST endpoints)
- **Auth:** Claude Code OAuth via `setup-token`, token stored in macOS Keychain
- **Cron system:** OpenClaw's built-in cron (17 jobs already scheduled), managed via `openclaw cron list`
- **Projects registry:** `~/clawd/REGISTRY.json` and `~/clawd/projects.yaml`
- **Existing scripts directory:** `~/clawd/scripts/` (34+ custom scripts)
- **Mission Control:** Next.js app at `~/clawd/mission-control/`, running on port 3100

### Prerequisites — Verify These First

1. **GitHub Personal Access Token** with `gist` scope. Check if one already exists in Keychain:
   ```bash
   security find-generic-password -s "github-gist-token" -a "$(whoami)" -w 2>/dev/null
   ```
   If not found, the user (Jason) needs to create one at https://github.com/settings/tokens and store it:
   ```bash
   security add-generic-password -s "github-gist-token" -a "$(whoami)" -w "TOKEN_HERE"
   ```

2. **Claude API key or OpenClaw access** for summarization. You already have this via the gateway. Use `openclaw` CLI or the Anthropic API directly.

3. **Chrome developer mode** enabled for extension loading.

4. **Register this project** using the existing dossier system:
   ```bash
   ~/clawd/scripts/new-dossier.sh bookmark-keeper --repo bookmark-keeper
   ```

---

## Milestone 1: Chrome Extension (Basic) — Save URL to Gist

**Goal:** Clicking the extension icon opens a popup. Clicking "Save Page" sends the current tab's URL, title, and timestamp to a private GitHub Gist.

### 1.1 Create the Gist

Create a private GitHub Gist with a single file called `bookmark-queue.json` containing an empty array: `[]`

Save the Gist ID. You will need it in the extension and processing script.

### 1.2 Extension File Structure

```
~/Projects/bookmark-keeper/extension/
├── manifest.json
├── popup.html
├── popup.js
├── background.js
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

### 1.3 manifest.json

Use Manifest V3. Key permissions needed:
- `activeTab` (to read current tab URL/title)
- `storage` (to persist the Gist ID and GitHub token locally)
- Host permission for `https://api.github.com/*`

```json
{
  "manifest_version": 3,
  "name": "Bookmark Keeper",
  "version": "1.0",
  "description": "Capture pages to GitHub Gist queue for processing",
  "permissions": ["activeTab", "storage"],
  "host_permissions": ["https://api.github.com/*"],
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

### 1.4 popup.html

Simple UI:
- "Save Page" button
- Status text area (shows "Saved!" or error)
- Settings link/section to configure GitHub token and Gist ID on first use

### 1.5 popup.js — Core Logic

```javascript
// On "Save Page" click:
// 1. Get active tab via chrome.tabs.query({ active: true, currentWindow: true })
// 2. Extract tab.url and tab.title
// 3. Build bookmark object: { url, title, selection: null, note: null, timestamp: new Date().toISOString() }
// 4. Fetch current Gist content via GitHub API (GET /gists/{gist_id})
// 5. Parse the bookmark-queue.json file content
// 6. Append new bookmark to array
// 7. PATCH /gists/{gist_id} with updated content
// 8. Show success/error in popup
```

**Race condition mitigation:** When appending to the Gist, always GET the current content first, then PATCH. This prevents overwriting items added between reads. For additional safety, the processing script (Milestone 2) should remove items individually after processing, not clear the whole array.

### 1.6 Icons

Generate simple placeholder icons. A bookmark or pin shape in a solid color is fine. These can be polished later (Milestone 5).

### 🛑 Milestone 1 Gate

- [ ] Extension loads in Chrome without errors
- [ ] Clicking "Save Page" on any tab creates/updates the Gist with the URL and title
- [ ] Gist contains valid JSON with the bookmark entry
- [ ] Multiple saves append correctly (no overwrites)
- [ ] Commit: `git add -A && git commit -m "feat: basic chrome extension, save URL to gist"`

---

## Milestone 2: Processing Script — Fetch, Convert, Save

**Goal:** A script that reads the Gist queue, fetches each URL's content, converts to markdown, and saves to `~/clawd/workspace/bookmarks/`.

### 2.1 Script Location

```
~/clawd/scripts/process-bookmarks.sh
```

Make it executable: `chmod +x ~/clawd/scripts/process-bookmarks.sh`

### 2.2 Script Flow

```bash
#!/usr/bin/env bash
set -euo pipefail

GIST_ID="YOUR_GIST_ID"
BOOKMARKS_DIR="${HOME}/clawd/workspace/bookmarks"
TOKEN=$(security find-generic-password -s "github-gist-token" -a "$(whoami)" -w)

mkdir -p "$BOOKMARKS_DIR"

# 1. Fetch Gist content
# 2. Parse JSON array of pending bookmarks
# 3. For each bookmark:
#    a. Fetch page content (curl + readability or pandoc)
#    b. Convert to markdown
#    c. Generate slug from title: YYYY-MM-DD-<slugified-title>.md
#    d. Write markdown file with frontmatter (see Output Format below)
#    e. Remove THIS ITEM from the Gist (not the whole array)
# 4. Log results
```

### 2.3 Content Fetching Strategy

Start simple. Many sites will work with a basic curl + content extraction:

```bash
# Option A: curl + pandoc (handles most static sites)
curl -sL "$url" | pandoc -f html -t markdown --wrap=none

# Option B: If you have readability-cli installed
# npm install -g @mozilla/readability-cli
readable "$url" --output markdown
```

**Do not use a headless browser in v1.** Log failures and move on. The user can manually capture failed URLs later.

### 2.4 Output Format

Each saved file should use YAML frontmatter for programmatic access:

```markdown
---
title: "Article Title"
url: https://example.com/article
saved: 2026-02-09
note: "Why I saved this..."
tags: []
summary: ""
---

# Article Title

[Full markdown content here]
```

The `summary` field stays empty for now. Milestone 3 fills it in.
The `tags` field stays empty. No tagging system yet, but the field is free to add now.

### 2.5 Per-Item Removal from Gist

After successfully processing each bookmark, remove only that item from the Gist. This prevents data loss if the script crashes mid-batch:

```bash
# After processing item at index $i:
# 1. GET current Gist content
# 2. Remove the processed item (match by URL + timestamp, not index, since new items may have been added)
# 3. PATCH Gist with updated array
```

### 🛑 Milestone 2 Gate

- [ ] Script reads from Gist and fetches page content
- [ ] Markdown files appear in `~/clawd/workspace/bookmarks/`
- [ ] Frontmatter is valid YAML
- [ ] Processed items are removed from the Gist individually
- [ ] Script handles fetch failures gracefully (logs error, continues to next item)
- [ ] Manual run works: `~/clawd/scripts/process-bookmarks.sh`
- [ ] Commit: `git add -A && git commit -m "feat: processing script, fetch and save bookmarks"`

---

## Milestone 3: Add Summarization

**Goal:** Each processed bookmark gets a 2-3 sentence AI-generated summary in the frontmatter.

### 3.1 Summarization Approach

Two options, pick based on preference:

**Option A: Direct Anthropic API call**
```bash
# Use curl to call the Anthropic API
# System prompt: "Summarize the following article in 2-3 sentences. Be specific and informative, not generic."
# Pass the markdown content as the user message
# Parse the response and inject into the summary frontmatter field
```

**Option B: Use OpenClaw CLI**
```bash
# If openclaw has a message/prompt command:
openclaw message send --agent main "Summarize this article in 2-3 sentences: [content]"
```

Option A is more reliable for a cron job since it doesn't depend on gateway state. Recommended.

### 3.2 Integration Point

In the processing loop from Milestone 2, after converting content to markdown and before writing the file:

1. Send content to Claude API for summarization
2. Receive summary
3. Insert into the `summary` frontmatter field
4. Write file

### 3.3 Cost Awareness

Each bookmark costs roughly one API call. At ~2-3 pages per day, this is negligible. If volume increases, consider batching summaries or using Haiku instead of Sonnet for this task.

### 🛑 Milestone 3 Gate

- [ ] Processed bookmarks have non-empty `summary` fields
- [ ] Summaries are 2-3 sentences, specific to the content (not generic)
- [ ] API failures don't block file saving (save with empty summary, log the error)
- [ ] Commit: `git add -A && git commit -m "feat: AI summarization for bookmarks"`

---

## Milestone 4: INDEX.md Generation

**Goal:** Auto-generate an index file listing all saved bookmarks, sorted by date.

### 4.1 Index Format

```markdown
# Bookmark Index

*Last updated: 2026-02-09*

## 2026-02-09

- [Article Title](./2026-02-09-some-article.md) — 2-3 sentence summary here.
- [Another Article](./2026-02-09-another.md) — Summary here.

## 2026-02-08

- [Older Article](./2026-02-08-older.md) — Summary here.
```

### 4.2 Generation Logic

Run after all items in a batch are processed:

```bash
# 1. Find all .md files in bookmarks dir (excluding INDEX.md)
# 2. For each file, extract title, date, and summary from frontmatter
# 3. Group by date, sort descending (newest first)
# 4. Write INDEX.md
```

Use `yq` or a simple `awk`/`sed` to parse YAML frontmatter. Or write a small Python/Node script if parsing gets complex.

### 🛑 Milestone 4 Gate

- [ ] INDEX.md exists and lists all bookmarks
- [ ] Grouped by date, newest first
- [ ] Links are relative and correct
- [ ] Regenerating INDEX.md is idempotent
- [ ] Commit: `git add -A && git commit -m "feat: auto-generated INDEX.md"`

---

## Milestone 5: Extension Polish — Selection, Notes, Icon

**Goal:** Upgrade the Chrome extension to capture text selection and user notes.

### 5.1 Selection Capture

In `popup.js`, before building the bookmark object:

```javascript
// Inject a content script to get selected text
chrome.scripting.executeScript({
  target: { tabId: tab.id },
  func: () => window.getSelection().toString()
}, (results) => {
  const selection = results?.[0]?.result || null;
  // Include in bookmark object
});
```

This requires the `scripting` permission in manifest.json. Add it.

### 5.2 Notes Field

Add a textarea to `popup.html` below the Save button:
- Placeholder: "Why are you saving this? (optional)"
- Include the note value in the bookmark object sent to the Gist

### 5.3 UI Polish

- Show the current page title in the popup so the user knows what they are saving
- Add a visual indicator when text is selected ("Selection captured: 142 chars")
- Success/error states with brief animations or color changes
- Clean, minimal styling. No frameworks needed for a popup this simple.

### 5.4 Icon

Create a simple, recognizable icon. A bookmark shape or pushpin in a distinct color. Generate at 16x16, 48x48, and 128x128.

### 🛑 Milestone 5 Gate

- [ ] Text selection is captured when present
- [ ] Note field works and appears in Gist data
- [ ] Popup shows current page title
- [ ] Icon is visible and recognizable in the Chrome toolbar
- [ ] Commit: `git add -A && git commit -m "feat: selection capture, notes, polished UI"`

---

## Milestone 6: Cron Job Setup

**Goal:** Schedule the processing script to run every 15 minutes via OpenClaw's cron system.

### 6.1 Cron Configuration

Add to `openclaw.json` under the cron jobs section. You already have 17 jobs configured. Check the existing format:

```bash
openclaw cron list
```

Then add the bookmark processing job. The exact config key depends on your current cron setup, but it should look something like:

```json
{
  "name": "process-bookmarks",
  "schedule": "*/15 * * * *",
  "command": "bash ~/clawd/scripts/process-bookmarks.sh",
  "enabled": true
}
```

### 6.2 Manual Trigger Support

The script should also work when called directly for immediate processing:

```bash
~/clawd/scripts/process-bookmarks.sh
```

No special flags needed. The script is already idempotent (processes what's in the queue, removes processed items).

### 6.3 Logging

Log output to a predictable location so you can debug issues:

```bash
LOGFILE="${HOME}/clawd/workspace/bookmarks/processing.log"
```

Append timestamped entries for each run: how many items processed, any failures, duration.

### 🛑 Milestone 6 Gate

- [ ] Cron job appears in `openclaw cron list`
- [ ] Job runs on schedule and processes queued bookmarks
- [ ] Manual trigger works
- [ ] Log file captures run details
- [ ] Commit: `git add -A && git commit -m "feat: cron job for bookmark processing"`

---

## Architecture Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| Gist as queue (not a database) | Zero infrastructure. Private, versioned, accessible from anywhere. Good enough for single-user volume. |
| Per-item removal from Gist | Prevents data loss from race conditions between extension writes and script reads. |
| YAML frontmatter (not inline markdown) | Enables programmatic queries later. Free to add now, expensive to migrate later. |
| Empty `tags: []` field included | Costs nothing. Saves a migration if you add tagging later. |
| Direct API for summarization (not OpenClaw CLI) | More reliable for unattended cron execution. No dependency on gateway state. |
| Basic curl for content fetching | YAGNI. Headless browser is heavy infrastructure for a problem that affects maybe 20% of URLs. Log failures, handle manually. |
| OpenClaw cron (not system crontab) | Consistent with your existing 17 jobs. Managed through the same tooling. Benefits from the cron reliability fixes in v2026.2.6. |

---

## What's NOT Included (YAGNI)

- Tagging/categorization
- Full-text search (use `grep` / `ripgrep`)
- Web UI for browsing (future project)
- Mobile capture (could add iOS Shortcut later)
- Duplicate detection
- Headless browser for JS-rendered sites

---

## File Inventory

When complete, the project should contain:

```
~/Projects/bookmark-keeper/
├── extension/
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   └── icons/

~/clawd/scripts/
├── process-bookmarks.sh

~/clawd/workspace/bookmarks/
├── INDEX.md
├── processing.log
├── YYYY-MM-DD-<slug>.md (output files)
```
