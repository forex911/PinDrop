<p align="center">
  <img src="icons/icon128.png" alt="Pindrop Logo" width="128" height="128">
</p>

<h1 align="center">Pindrop</h1>

<p align="center">
  Premium Chrome Extension for Designer Workflows
</p>

# PinDrop

Premium Chrome Extension for Professional Designer Workflows

PinDrop allows users to drag any image from Pinterest and instantly copy it to the clipboard in a Photoshop-ready format. This removes the need for manual downloads, save dialogs, and unnecessary folder management.

Workflow:

Pinterest → Drag Image → Auto Copy to Clipboard → Ctrl + V in Photoshop

---

## Overview

PinDrop is built for designers, editors, content creators, and Pinterest power users who need a faster workflow for collecting visual assets.

Instead of downloading images manually, users can simply drag an image from Pinterest and the extension automatically:

* Detects the drag action
* Fetches the highest available image quality
* Converts the asset into clipboard-compatible PNG format
* Copies it directly to the system clipboard
* Displays a clean confirmation notification

This creates a seamless production workflow for tools like Adobe Photoshop, Figma, Canva, Illustrator, PowerPoint, and other design software.

---

## Installation

### Chrome Installation

1. Download and extract the project folder

2. Open Chrome and navigate to:

chrome://extensions/

3. Enable Developer Mode using the toggle in the top-right corner

4. Click “Load unpacked”

5. Select the project folder:

pinterest-drag-pro

6. Open Pinterest and begin dragging images

The extension will start working immediately after installation.

---

## How It Works

| Step | Action                                                         |
| ---- | -------------------------------------------------------------- |
| 1    | Browse Pinterest normally                                      |
| 2    | Click and drag any image                                       |
| 3    | The extension detects the drag action                          |
| 4    | The highest available resolution is fetched from Pinterest CDN |
| 5    | The image is converted to PNG format                           |
| 6    | The image is copied directly to the clipboard                  |
| 7    | A confirmation toast appears                                   |
| 8    | Open Photoshop and press Ctrl + V                              |

---

## Project Structure

```text
pinterest-drag-pro/
├── manifest.json
├── background.js
├── popup.html
├── popup.css
├── popup.js
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── src/
    ├── content.js
    └── toast.css
```

---

## Architecture

### content.js

This file contains the core extension engine and is responsible for the main user workflow.

Core systems include:

#### DragDetector

Detects real drag intent using a combination of mousedown and mousemove threshold logic. This prevents accidental triggers and improves reliability across Pinterest layouts.

#### ImageResolver

Resolves and upgrades image URLs from Pinterest CDN to the highest available quality using automatic path rewriting and fallback logic.

#### ClipboardWriter

Fetches the image, converts it using OffscreenCanvas, and writes it to the system clipboard in PNG format for maximum compatibility.

#### ToastUI

Displays lightweight in-page notifications to confirm successful clipboard actions.

#### SessionStore

Handles duplicate prevention, temporary history tracking, and session optimization using sessionStorage.

---

### background.js

Acts as the Manifest V3 service worker.

Responsibilities include:

* Badge counter updates
* Extension state management
* Enable / Disable toggle handling
* Message communication between popup and content scripts

---

### popup.js

Controls the extension popup interface.

Features include:

* Live clipboard session history
* Last copied image preview
* Enable / Disable controls
* Session reset actions

---

## Technical Decisions

### Why OffscreenCanvas

Chrome Clipboard API requires image data to be written as image/png blobs.

OffscreenCanvas allows reliable in-memory conversion of JPG, WEBP, and other formats into PNG without creating visible DOM elements or temporary files.

This improves performance and avoids unnecessary rendering overhead.

---

### Why Dual Drag Detection

Pinterest often overrides native browser drag events using custom handlers.

Relying only on dragstart is unreliable across:

* Pin grid view
* Closeup pin view
* Board layouts
* Dynamic loaded sections

Using both mousedown and mousemove threshold detection ensures stable behavior across all Pinterest interfaces.

---

### Why URL Quality Upgrading

Pinterest serves multiple versions of the same image using path-based size variations such as:

/236x/
/474x/
/564x/
/736x/
/originals/

The extension automatically upgrades to the original asset first and falls back progressively if needed.

This guarantees the highest possible image quality.

---

## Permissions

| Permission                | Purpose                                         |
| ------------------------- | ----------------------------------------------- |
| clipboardWrite            | Copy image data to system clipboard             |
| storage                   | Save extension preferences and session state    |
| activeTab                 | Communicate with the active Pinterest tab       |
| scripting                 | Inject and manage content scripts               |
| Host Access: *.pinimg.com | Fetch high-resolution assets from Pinterest CDN |

Only required permissions are used.

No unnecessary browser access is requested.

---

## Supported Software

PinDrop is designed for workflows involving:

* Adobe Photoshop
* Adobe Illustrator
* Figma
* Canva
* Microsoft PowerPoint
* Google Slides
* Adobe Premiere Pro
* Notion
* Other clipboard-supported design tools

---

## Known Limitations

### CORS Restrictions

Some Pinterest assets may have restricted cross-origin policies depending on CDN routing.

When this happens, the extension automatically retries using lower resolution fallbacks.

---

### Pinterest Single Page Application Behavior

Pinterest dynamically injects content after navigation.

Some newly loaded pins may require a short initialization delay before becoming interactive.

This is handled using MutationObserver-based detection.

---

### Clipboard API Focus Requirement

Chrome requires the browser window to remain focused when writing to the clipboard.

If the browser loses focus during the action, clipboard writing may fail.

---

## License

MIT License

Free for personal and commercial use.
