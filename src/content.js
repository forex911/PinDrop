/**
 * Pindrop
 * Content Script — Core Engine
 *
 * Architecture:
 *   1. DragDetector     — Listens for mousedown/dragstart on images
 *   2. ImageResolver    — Upgrades URLs to highest available resolution
 *   3. ClipboardWriter  — Fetches, converts, and writes to clipboard
 *   4. ToastUI          — Lightweight in-page notification system
 *   5. SessionStore     — Deduplication + history (sessionStorage)
 */

'use strict';

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */
const EXT_ID     = 'pinterest-drag-pro';
const STORAGE_KEY = 'pdcp_session';
const MAX_HISTORY = 20;
const RETRY_LIMIT = 3;
const RETRY_DELAY = 600; // ms

/* Pinterest CDN quality ladder — highest first */
const QUALITY_LADDER = [
  '/originals/',
  '/736x/',
  '/564x/',
  '/474x/',
  '/236x/',
  '/170x/',
  '/75x75_RS/',
];

/* ─────────────────────────────────────────────
   SESSION STORE — dedup + history
───────────────────────────────────────────── */
const SessionStore = (() => {
  const _get = () => {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{"history":[],"copied":{}}');
    } catch { return { history: [], copied: {} }; }
  };
  const _save = (data) => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
  };

  return {
    isDuplicate(url) {
      const data = _get();
      const normalized = ImageResolver.normalizeUrl(url);
      return !!data.copied[normalized];
    },

    markCopied(url, thumb) {
      const data = _get();
      const normalized = ImageResolver.normalizeUrl(url);
      data.copied[normalized] = Date.now();

      const entry = {
        id:        Date.now(),
        url:       normalized,
        thumb:     thumb || normalized,
        timestamp: new Date().toISOString(),
      };
      data.history.unshift(entry);
      if (data.history.length > MAX_HISTORY) data.history = data.history.slice(0, MAX_HISTORY);
      _save(data);

      /* Broadcast to popup */
      chrome.runtime.sendMessage({
        type:    'SESSION_UPDATE',
        history: data.history,
        last:    entry,
      }).catch(() => {});
    },

    getHistory() { return _get().history; },
    clear()      { _save({ history: [], copied: {} }); },
  };
})();

/* ─────────────────────────────────────────────
   IMAGE RESOLVER — upgrade to max quality URL
───────────────────────────────────────────── */
const ImageResolver = (() => {
  /** Strip query params and size segments; get canonical base */
  const normalizeUrl = (url) => {
    try {
      const u = new URL(url);
      /* Remove Pinterest tracking params */
      ['e', 'b', 'p', 'r', 'rs'].forEach(p => u.searchParams.delete(p));
      return u.origin + u.pathname;
    } catch { return url; }
  };

  /** Upgrade a pinimg.com CDN URL to the highest available size */
  const upgradeToOriginal = (url) => {
    if (!url) return null;
    try {
      const u = new URL(url);
      /* Must be a Pinterest CDN domain */
      if (!u.hostname.includes('pinimg.com') && !u.hostname.includes('pinterest.com')) return url;

      let path = u.pathname;
      for (const seg of QUALITY_LADDER) {
        const regex = /\/\d+x\d*[^/]*\//;
        if (path.match(regex) || path.includes(seg)) {
          path = path.replace(regex, '/originals/').replace(seg, '/originals/');
          break;
        }
      }
      return u.origin + path;
    } catch { return url; }
  };

  /** Extract the best image URL from a DOM element and surrounding context */
  const extractBestUrl = (element) => {
    const candidates = new Set();

    /* 1. data-* attributes Pinterest uses */
    const dataAttrs = [
      'data-src', 'data-original', 'data-pin-media',
      'data-story-pin-full-image', 'data-canonical-url',
    ];
    for (const attr of dataAttrs) {
      const val = element.getAttribute(attr);
      if (val) candidates.add(val);
    }

    /* 2. srcset — grab the largest declared size */
    const srcset = element.getAttribute('srcset') || element.getAttribute('data-srcset');
    if (srcset) {
      const parts = srcset.split(',').map(s => s.trim().split(/\s+/));
      let bestW = 0, bestUrl = null;
      for (const [url, descriptor] of parts) {
        const w = parseInt(descriptor) || 0;
        if (w > bestW) { bestW = w; bestUrl = url; }
      }
      if (bestUrl) candidates.add(bestUrl);
    }

    /* 3. src */
    if (element.src) candidates.add(element.src);

    /* 4. Traverse up the DOM — Pinterest wraps imgs in anchor/div with richer URLs */
    let node = element.parentElement;
    for (let i = 0; i < 8 && node; i++) {
      for (const attr of dataAttrs) {
        const val = node.getAttribute(attr);
        if (val) candidates.add(val);
      }
      /* Check <a> href that ends in an image extension */
      if (node.tagName === 'A' && node.href && /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(node.href)) {
        candidates.add(node.href);
      }
      node = node.parentElement;
    }

    /* 5. Try to find the pin ID in the URL, then build API request */
    const pinIdMatch = window.location.pathname.match(/\/pin\/(\d+)/);
    if (pinIdMatch) {
      /* Pinterest's internal image data is already in the page's __PWS_INITIAL_PROPS__ */
      const propsEl = document.getElementById('__PWS_INITIAL_PROPS__');
      if (propsEl) {
        try {
          const props = JSON.parse(propsEl.textContent);
          const imgUrl = deepFind(props, 'image_large_url') || deepFind(props, 'image_url');
          if (imgUrl) candidates.add(imgUrl);
        } catch {}
      }
    }

    /* Pick the best candidate */
    let best = null;
    for (const url of candidates) {
      const upgraded = upgradeToOriginal(url);
      if (!best || scoreUrl(upgraded) > scoreUrl(best)) best = upgraded;
    }
    return best;
  };

  /** Score a URL by quality — originals > 736x > rest */
  const scoreUrl = (url) => {
    if (!url) return -1;
    for (let i = 0; i < QUALITY_LADDER.length; i++) {
      if (url.includes(QUALITY_LADDER[i])) return QUALITY_LADDER.length - i;
    }
    return 0;
  };

  /** Deep-search a plain object for the first value at a given key */
  const deepFind = (obj, key, depth = 0) => {
    if (depth > 8 || !obj || typeof obj !== 'object') return null;
    if (obj[key]) return obj[key];
    for (const v of Object.values(obj)) {
      const found = deepFind(v, key, depth + 1);
      if (found) return found;
    }
    return null;
  };

  return { extractBestUrl, upgradeToOriginal, normalizeUrl, scoreUrl };
})();

/* ─────────────────────────────────────────────
   CLIPBOARD WRITER — fetch → convert → copy
───────────────────────────────────────────── */
const ClipboardWriter = (() => {
  let _inProgress = false;

  const fetchWithRetry = async (url, attempt = 1) => {
    try {
      const res = await fetch(url, {
        mode: 'cors',
        credentials: 'omit',
        cache: 'force-cache',
        headers: { 'Accept': 'image/webp,image/png,image/*,*/*;q=0.8' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (attempt < RETRY_LIMIT) {
        /* Try next quality rung on retry */
        const fallback = downgradePinUrl(url, attempt);
        await sleep(RETRY_DELAY * attempt);
        return fetchWithRetry(fallback || url, attempt + 1);
      }
      throw err;
    }
  };

  const downgradePinUrl = (url, step) => {
    try {
      const u = new URL(url);
      const target = QUALITY_LADDER[step] || '/564x/';
      u.pathname = u.pathname.replace('/originals/', target);
      return u.href;
    } catch { return url; }
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  /**
   * Convert any image blob to PNG-format blob via OffscreenCanvas
   * (works in content-script context inside Chrome extension)
   */
  const toPngBlob = async (blob) => {
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas.convertToBlob({ type: 'image/png' });
  };

  const writeToClipboard = async (pngBlob) => {
    const item = new ClipboardItem({ 'image/png': pngBlob });
    await navigator.clipboard.write([item]);
  };

  return {
    get inProgress() { return _inProgress; },

    async copy(url, thumbUrl) {
      if (_inProgress) return { ok: false, reason: 'busy' };
      if (SessionStore.isDuplicate(url)) {
        ToastUI.show('Already copied this image ✓', 'info');
        return { ok: false, reason: 'duplicate' };
      }

      _inProgress = true;
      ToastUI.show('Fetching image…', 'loading');

      try {
        /* Check extension is enabled */
        const { enabled = true } = await chrome.storage.local.get('enabled');
        if (!enabled) {
          ToastUI.show('Extension is disabled', 'warn');
          return { ok: false, reason: 'disabled' };
        }

        const res      = await fetchWithRetry(url);
        const rawBlob  = await res.blob();
        const pngBlob  = await toPngBlob(rawBlob);

        await writeToClipboard(pngBlob);

        SessionStore.markCopied(url, thumbUrl);
        ToastUI.show('Copied to Clipboard ✓', 'success');

        /* Notify background for badge update */
        chrome.runtime.sendMessage({ type: 'IMAGE_COPIED', url }).catch(() => {});

        return { ok: true, url };
      } catch (err) {
        console.error(`[${EXT_ID}] Clipboard error:`, err);
        const msg = err.message?.includes('CORS') || err.message?.includes('Failed to fetch')
          ? 'Fetch blocked — CORS restriction'
          : 'Copy failed. Try again.';
        ToastUI.show(msg, 'error');
        return { ok: false, reason: err.message };
      } finally {
        _inProgress = false;
      }
    },
  };
})();

/* ─────────────────────────────────────────────
   TOAST UI — premium notification system
───────────────────────────────────────────── */
const ToastUI = (() => {
  let _container = null;
  let _activeToast = null;
  let _hideTimer = null;

  const ensureContainer = () => {
    if (_container) return _container;
    _container = document.createElement('div');
    _container.id = `${EXT_ID}-toast-container`;
    document.body.appendChild(_container);
    return _container;
  };

  return {
    show(message, type = 'success') {
      const container = ensureContainer();

      /* Clear existing */
      if (_hideTimer) clearTimeout(_hideTimer);
      if (_activeToast) {
        _activeToast.classList.add('pdcp-toast--exit');
        setTimeout(() => _activeToast?.remove(), 300);
      }

      const toast = document.createElement('div');
      toast.className = `pdcp-toast pdcp-toast--${type}`;

      const icon = {
        success: '✦',
        loading: '◐',
        error:   '⚠',
        warn:    '◉',
        info:    '◈',
      }[type] || '✦';

      toast.innerHTML = `
        <span class="pdcp-toast__icon" ${type === 'loading' ? 'data-spin="true"' : ''}>${icon}</span>
        <span class="pdcp-toast__msg">${message}</span>
      `;

      container.appendChild(toast);
      _activeToast = toast;

      /* Trigger animation */
      requestAnimationFrame(() => toast.classList.add('pdcp-toast--enter'));

      if (type !== 'loading') {
        const delay = type === 'error' ? 4000 : 2200;
        _hideTimer = setTimeout(() => {
          toast.classList.remove('pdcp-toast--enter');
          toast.classList.add('pdcp-toast--exit');
          setTimeout(() => { toast.remove(); if (_activeToast === toast) _activeToast = null; }, 350);
        }, delay);
      }
    },

    hide() {
      if (_hideTimer) clearTimeout(_hideTimer);
      if (_activeToast) {
        _activeToast.classList.add('pdcp-toast--exit');
        setTimeout(() => { _activeToast?.remove(); _activeToast = null; }, 350);
      }
    },
  };
})();

/* ─────────────────────────────────────────────
   DRAG DETECTOR — the core interaction engine
───────────────────────────────────────────── */
const DragDetector = (() => {
  let _lastProcessedUrl = null;
  let _dragTarget       = null;
  let _mousedownPos     = { x: 0, y: 0 };
  const DRAG_THRESHOLD  = 6; // px — prevent accidental triggers on clicks

  const isImage = (el) => el && (el.tagName === 'IMG' || el.tagName === 'VIDEO' ||
    el.closest('[data-test-id="pin-closeup-image"]') ||
    el.closest('[data-test-id="pinImageWrapper"]') ||
    el.closest('[data-test-id="pin-visual-wrapper"]'));

  const findNearestImg = (el) => {
    if (!el) return null;
    if (el.tagName === 'IMG') return el;
    return el.querySelector('img') ||
      el.closest('[data-test-id]')?.querySelector('img') ||
      el.parentElement?.querySelector('img');
  };

  const onMouseDown = (e) => {
    const img = isImage(e.target) ? findNearestImg(e.target) : null;
    if (!img) return;
    _dragTarget  = img;
    _mousedownPos = { x: e.clientX, y: e.clientY };
  };

  const onMouseMove = (e) => {
    if (!_dragTarget) return;
    const dx = Math.abs(e.clientX - _mousedownPos.x);
    const dy = Math.abs(e.clientY - _mousedownPos.y);
    if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
      handleDrag(_dragTarget);
      _dragTarget = null; // fire once per gesture
    }
  };

  const onMouseUp = () => { _dragTarget = null; };

  const onDragStart = (e) => {
    const img = findNearestImg(e.target);
    if (img) handleDrag(img);
  };

  const handleDrag = (imgEl) => {
    const url = ImageResolver.extractBestUrl(imgEl);
    if (!url) return;
    /* Deduplicate within same gesture */
    if (url === _lastProcessedUrl) return;
    _lastProcessedUrl = url;
    setTimeout(() => { _lastProcessedUrl = null; }, 2000);

    /* Kick off async copy — non-blocking */
    ClipboardWriter.copy(url, imgEl.src || url);
  };

  return {
    init() {
      document.addEventListener('mousedown',  onMouseDown,  { capture: true, passive: true });
      document.addEventListener('mousemove',  onMouseMove,  { capture: true, passive: true });
      document.addEventListener('mouseup',    onMouseUp,    { capture: true, passive: true });
      document.addEventListener('dragstart',  onDragStart,  { capture: true, passive: true });
      console.info(`[${EXT_ID}] Drag detector active`);
    },

    destroy() {
      document.removeEventListener('mousedown', onMouseDown,  { capture: true });
      document.removeEventListener('mousemove', onMouseMove,  { capture: true });
      document.removeEventListener('mouseup',   onMouseUp,    { capture: true });
      document.removeEventListener('dragstart', onDragStart,  { capture: true });
    },
  };
})();

/* ─────────────────────────────────────────────
   PINTEREST SPA ROUTER — handle page changes
───────────────────────────────────────────── */
const SPARouter = (() => {
  let _lastPath = location.pathname;

  const check = () => {
    if (location.pathname !== _lastPath) {
      _lastPath = location.pathname;
      /* Slight delay for Pinterest's React to render new content */
      setTimeout(() => {
        chrome.runtime.sendMessage({ type: 'PAGE_CHANGED', path: _lastPath }).catch(() => {});
      }, 800);
    }
  };

  return {
    init() {
      /* Pinterest is a SPA — use MutationObserver + popstate */
      const observer = new MutationObserver(check);
      observer.observe(document.body, { childList: true, subtree: false });
      window.addEventListener('popstate', check);
    },
  };
})();

/* ─────────────────────────────────────────────
   MESSAGE HANDLER — popup → content bridge
───────────────────────────────────────────── */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case 'GET_SESSION':
      sendResponse({ history: SessionStore.getHistory() });
      return true;
    case 'CLEAR_SESSION':
      SessionStore.clear();
      sendResponse({ ok: true });
      return true;
    case 'GET_STATUS':
      sendResponse({ active: true, busy: ClipboardWriter.inProgress });
      return true;
  }
});

/* ─────────────────────────────────────────────
   BOOT
───────────────────────────────────────────── */
(async () => {
  const { enabled = true } = await chrome.storage.local.get('enabled');
  if (enabled) {
    DragDetector.init();
    SPARouter.init();
    console.info(`[${EXT_ID}] v1.0.0 — Pindrop active`);
  }

  /* Listen for enable/disable from popup */
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) {
      if (changes.enabled.newValue) DragDetector.init();
      else DragDetector.destroy();
    }
  });
})();
