# Bookmark Keeper iOS Shortcut

iOS Shortcut version of the Bookmark Keeper Chrome extension. Saves pages to the same GitHub Gist queue.

## Setup

### Prerequisites
1. GitHub Personal Access Token (same one used in the Chrome extension)
2. Gist ID: `d37553e2f87fd4d73381ac88c147da1c` (or your custom one)

### Create the Shortcut

1. Open the **Shortcuts** app on your iPhone
2. Tap **+** to create a new shortcut
3. Tap the shortcut name at top → rename to **"Save Bookmark"**
4. Tap the **ⓘ** icon → enable **"Show in Share Sheet"**
5. Under "Receive" select: **URLs, Safari web pages, Articles**

### Add These Actions (in order):

#### 1. Get URL from Share Sheet
- Add: **"Get URLs from Input"**
- Input: Shortcut Input

#### 2. Set URL Variable
- Add: **"Set Variable"**
- Variable Name: `pageURL`

#### 3. Get Page Title  
- Add: **"Get Name"**
- Input: Shortcut Input

#### 4. Set Title Variable
- Add: **"Set Variable"**
- Variable Name: `pageTitle`

#### 5. Ask for Note (Optional)
- Add: **"Ask for Input"**
- Prompt: "Add a note (optional)"
- Input Type: Text
- Default Answer: (leave empty)

#### 6. Set Note Variable
- Add: **"Set Variable"**
- Variable Name: `note`

#### 7. Get Current Date
- Add: **"Date"**
- Date: Current Date

#### 8. Format Date as ISO
- Add: **"Format Date"**
- Format: Custom
- Custom Format: `yyyy-MM-dd'T'HH:mm:ssZ`

#### 9. Set Timestamp Variable
- Add: **"Set Variable"**
- Variable Name: `timestamp`

#### 10. Fetch Existing Gist
- Add: **"Get Contents of URL"**
- URL: `https://api.github.com/gists/d37553e2f87fd4d73381ac88c147da1c`
- Method: GET
- Headers:
  - `Authorization`: `token YOUR_GITHUB_TOKEN_HERE`
  - `Accept`: `application/vnd.github.v3+json`

#### 11. Get Dictionary Value
- Add: **"Get Dictionary Value"**
- Key: `files`

#### 12. Get Nested Value
- Add: **"Get Dictionary Value"**  
- Key: `bookmark-queue.json`

#### 13. Get Content
- Add: **"Get Dictionary Value"**
- Key: `content`

#### 14. Get Dictionary from Input
- Add: **"Get Dictionary from Input"**

#### 15. Set Existing Bookmarks Variable
- Add: **"Set Variable"**
- Variable Name: `existingBookmarks`

#### 16. Build New Bookmark JSON
- Add: **"Text"**
- Content:
```json
{
  "url": "[pageURL]",
  "title": "[pageTitle]",
  "selection": null,
  "note": "[note]",
  "timestamp": "[timestamp]"
}
```
(Use the variable picker to insert the variables)

#### 17. Get Dictionary from Text
- Add: **"Get Dictionary from Input"**

#### 18. Set New Bookmark Variable
- Add: **"Set Variable"**
- Variable Name: `newBookmark`

#### 19. Combine Arrays
- Add: **"Combine Lists"**
- First List: `existingBookmarks`
- Second List: `newBookmark`

#### 20. Convert to JSON Text
- Add: **"Make Rich Text from HTML"** then **"Get Text from Input"**
- OR use a **"Text"** action with the combined list

Actually easier: 
- Add: **"Get Contents of URL"** (for the PATCH request)

#### 20. Update Gist (PATCH Request)
- Add: **"Get Contents of URL"**
- URL: `https://api.github.com/gists/d37553e2f87fd4d73381ac88c147da1c`
- Method: PATCH
- Headers:
  - `Authorization`: `token YOUR_GITHUB_TOKEN_HERE`
  - `Content-Type`: `application/json`
  - `Accept`: `application/vnd.github.v3+json`
- Request Body: JSON
- Build the body with the updated bookmarks array

#### 21. Show Success
- Add: **"Show Notification"**
- Title: "Bookmark Saved"
- Body: `pageTitle`

---

## Simplified Version (Recommended)

The above is complex. Here's a simpler approach using a helper script:

### Option A: Use a Webhook/Proxy

Set up a simple webhook that handles the Gist logic, then the shortcut just needs to POST the data.

### Option B: Use the Scriptable App

1. Install **Scriptable** from the App Store
2. Create a new script (see `scriptable-bookmark.js`)
3. Create a shortcut that runs the Scriptable script

---

## Files in this folder

- `README.md` - This file
- `scriptable-bookmark.js` - Scriptable app version (easiest)
- `shortcut-steps.txt` - Detailed shortcut steps
