# Bookmark Keeper iOS Setup

Two options: **Scriptable** (recommended) or **Pure Shortcuts** (simpler but limited).

---

## Option 1: Scriptable App (Recommended)

Full compatibility with Chrome extension - saves to same JSON queue.

### Step 1: Install Scriptable
- Download **Scriptable** from the App Store (free)

### Step 2: Create the Script
1. Open Scriptable
2. Tap **+** to create new script
3. Name it "Save Bookmark"
4. Paste the contents of `scriptable-bookmark.js`
5. **Replace `YOUR_GITHUB_TOKEN_HERE`** with your GitHub token
6. Tap Done

### Step 3: Create a Shortcut
1. Open **Shortcuts** app
2. Tap **+** → name it "Save Bookmark"
3. Tap **ⓘ** → enable **Show in Share Sheet**
4. Receive: **URLs, Safari web pages**
5. Add action: **Run Script** (Scriptable)
6. Select your "Save Bookmark" script
7. Pass: **Shortcut Input**

### Step 4: Use It
- In Safari (or any app), tap **Share** → **Save Bookmark**
- Add optional note → Save
- Done! Bookmark added to your Gist queue.

---

## Option 2: Pure Shortcuts (No Extra Apps)

Simpler but saves to a separate text log instead of the JSON queue.

### Create the Shortcut

1. Open **Shortcuts** → tap **+**
2. Name: "Quick Bookmark"
3. Tap **ⓘ** → enable **Show in Share Sheet**
4. Receive: **URLs**

### Actions:

**1. Get URLs from Input**
- Input: Shortcut Input

**2. Set Variable**
- Name: `url`

**3. Ask for Input**
- Prompt: "Note (optional)"
- Input Type: Text

**4. Set Variable**  
- Name: `note`

**5. Date**
- Current Date

**6. Format Date**
- Custom: `yyyy-MM-dd HH:mm`

**7. Set Variable**
- Name: `timestamp`

**8. Text**
```
[timestamp] | [url] | [note]
```

**9. Get Contents of URL**
- URL: `https://api.github.com/gists/YOUR_GIST_ID`
- Method: GET  
- Headers:
  - Authorization: `token YOUR_TOKEN`

**10. Get Dictionary Value**
- Key: files.bookmark-log.txt.content

**11. Set Variable**
- Name: `existing`

**12. Text**
```
[existing]
[timestamp] | [url] | [note]
```

**13. Get Contents of URL**
- URL: `https://api.github.com/gists/YOUR_GIST_ID`
- Method: PATCH
- Headers:
  - Authorization: `token YOUR_TOKEN`
  - Content-Type: `application/json`
- Request Body: JSON
```json
{
  "files": {
    "bookmark-log.txt": {
      "content": "[Text from step 12]"
    }
  }
}
```

**14. Show Notification**
- "Bookmark saved!"

---

## GitHub Token

You need a GitHub Personal Access Token with `gist` scope:

1. Go to github.com → Settings → Developer settings → Personal access tokens
2. Generate new token (classic)
3. Select scope: **gist**
4. Copy the token (you won't see it again!)

---

## Testing

After setup, share any webpage and select your shortcut. Check your Gist to verify the bookmark was added.

Gist URL: `https://gist.github.com/YOUR_USERNAME/YOUR_GIST_ID`
