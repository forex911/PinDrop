/**
 * Pindrop
 * Background Service Worker — MV3
 *
 * Responsibilities:
 *  - Badge counter management
 *  - Extension lifecycle events
 *  - Cross-tab state coordination
 *  - Icon state (enabled/disabled)
 */

'use strict';

/* ─────────────────────────────────────────────
   BADGE MANAGER
───────────────────────────────────────────── */
const Badge = {
  _count: 0,

  increment() {
    this._count++;
    chrome.action.setBadgeText({ text: String(this._count) });
    chrome.action.setBadgeBackgroundColor({ color: '#10E575' });
    chrome.action.setBadgeTextColor({ color: '#0A0F0A' });
  },

  reset() {
    this._count = 0;
    chrome.action.setBadgeText({ text: '' });
  },
};

/* ─────────────────────────────────────────────
   ICON STATE
───────────────────────────────────────────── */
const IconState = {
  async setEnabled(enabled) {
    /* Dim icon when disabled */
    await chrome.action.setIcon({
      path: enabled
        ? { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' }
        : { 16: 'icons/icon16_off.png', 32: 'icons/icon32_off.png', 48: 'icons/icon48_off.png', 128: 'icons/icon128_off.png' },
    }).catch(() => {
      /* Fallback — off icons may not exist, silently ignore */
    });
    chrome.action.setTitle({
      title: enabled
        ? 'Pindrop — Active'
        : 'Pindrop — Disabled',
    });
  },
};

/* ─────────────────────────────────────────────
   MESSAGE HANDLER
───────────────────────────────────────────── */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {

    case 'IMAGE_COPIED':
      Badge.increment();
      sendResponse({ ok: true });
      break;

    case 'RESET_BADGE':
      Badge.reset();
      sendResponse({ ok: true });
      break;

    case 'SESSION_UPDATE':
      /* Forward to popup if open */
      chrome.runtime.sendMessage({ type: 'SESSION_UPDATE', ...msg }).catch(() => {});
      sendResponse({ ok: true });
      break;

    case 'PAGE_CHANGED':
      /* No action needed — content script handles SPA routing */
      sendResponse({ ok: true });
      break;

    default:
      sendResponse({ ok: false, reason: 'unknown_message' });
  }
  return true; // keep message channel open for async
});

/* ─────────────────────────────────────────────
   STORAGE CHANGE LISTENER
───────────────────────────────────────────── */
chrome.storage.onChanged.addListener(async (changes) => {
  if (changes.enabled !== undefined) {
    await IconState.setEnabled(changes.enabled.newValue ?? true);
  }
});

/* ─────────────────────────────────────────────
   INSTALL / STARTUP
───────────────────────────────────────────── */
chrome.runtime.onInstalled.addListener(async (details) => {
  /* Set defaults */
  const existing = await chrome.storage.local.get(['enabled']);
  if (existing.enabled === undefined) {
    await chrome.storage.local.set({ enabled: true });
  }

  if (details.reason === 'install') {
    console.info('[PDCP] Extension installed — welcome!');
  } else if (details.reason === 'update') {
    Badge.reset();
    console.info('[PDCP] Extension updated to v1.0.0');
  }

  await IconState.setEnabled(existing.enabled ?? true);
});

chrome.runtime.onStartup.addListener(() => {
  Badge.reset();
});

console.info('[PDCP] Service worker initialized');
