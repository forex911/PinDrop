# Pindrop 🎨

**Premium Chrome Extension for Designer Workflows**

Drag any Pinterest image → auto-copied to clipboard → Ctrl+V in Photoshop.

---

## ⚡ Quick Install (Chrome)

1. Download and unzip this folder
2. Open Chrome → navigate to `chrome://extensions/`
3. Enable **Developer Mode** (top-right toggle)
4. Click **"Load unpacked"**
5. Select the `pinterest-drag-pro` folder
6. Visit **Pinterest** — start dragging images!

---

## 🔧 How It Works

| Step | Action |
|------|--------|
| 1 | Browse Pinterest normally |
| 2 | Click & drag any image (even a few pixels) |
| 3 | Extension detects drag instantly |
| 4 | Fetches highest resolution from Pinterest CDN |
| 5 | Converts to PNG and copies to clipboard |
| 6 | Toast notification: **"Copied to Clipboard ✓"** |
| 7 | Switch to Photoshop → **Ctrl+V** |

---

## 📁 File Structure

```
pinterest-drag-pro/
├── manifest.json          ← Extension config (MV3)
├── background.js          ← Service worker
├── popup.html             ← Extension popup
├── popup.css              ← Premium dark UI styles
├── popup.js               ← Popup logic
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── src/
    ├── content.js         ← Core engine (drag detect + clipboard)
    └── toast.css          ← In-page toast notification styles
```

---

## 🏗 Architecture

### `content.js` — 5 core systems:
- **DragDetector** — mousedown + mousemove threshold detection (no accidental triggers)
- **ImageResolver** — upgrades CDN URLs to `/originals/` quality automatically
- **ClipboardWriter** — fetch → OffscreenCanvas → PNG → clipboard
- **ToastUI** — lightweight in-page notification with animations
- **SessionStore** — deduplication + history using sessionStorage

### `background.js` — Service Worker:
- Badge counter tracking
- Icon state management (enabled/disabled)
- Cross-component message routing

### `popup.js` — Popup UI:
- Live session history
- Last copied image preview
- Enable/Disable toggle
- Session clear

---

## ⚙️ Key Technical Decisions

**Why OffscreenCanvas?**
Chrome's Clipboard API requires `image/png` blobs. OffscreenCanvas converts any
fetched WEBP/JPG to PNG in-memory without touching the DOM.

**Why dual drag detection (mousedown + mousemove)?**
Pinterest's custom drag handlers prevent the native `dragstart` event on some pin
layouts. Combining threshold-based mousemove detection ensures coverage across
all Pinterest UI variants (grid, closeup, board views).

**Why quality ladder / URL rewriting?**
Pinterest serves the same image at multiple resolutions via path segments
(`/236x/`, `/564x/`, `/736x/`, `/originals/`). The resolver always upgrades to
`/originals/` first and falls back through the ladder on fetch failure.

---

## 🔒 Permissions

| Permission | Why |
|-----------|-----|
| `clipboardWrite` | Copy images to clipboard |
| `storage` | Save enabled/disabled state |
| `activeTab` | Communicate with Pinterest tab |
| `scripting` | Inject content scripts |
| `host: *.pinimg.com` | Fetch high-res images from Pinterest CDN |

---

## 🚧 Known Limitations

- **CORS**: Pinterest CDN allows cross-origin reads from extensions but some
  specific pins may be restricted. The extension retries with lower resolution.
- **Pinterest SPA**: Content injected after navigation may take ~800ms to
  become interactive (handled by MutationObserver).
- **Clipboard API**: Requires the Chrome window to be focused when writing.

---

## 📄 License

MIT — Free for personal and commercial use.
