/**
 * Pindrop
 * Popup Controller — Premium UI logic
 */

'use strict';

/* ─────────────────────────────────────────────
   DOM References
───────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);

const UI = {
  app:            $('app'),
  enableToggle:   $('enableToggle'),
  statusBar:      $('statusBar'),
  statusDot:      $('statusDot'),
  statusLabel:    $('statusLabel'),
  previewEmpty:   $('previewEmpty'),
  previewContent: $('previewContent'),
  previewImg:     $('previewImg'),
  previewTime:    $('previewTime'),
  historyList:    $('historyList'),
  historyEmpty:   $('historyEmpty'),
  clearBtn:       $('clearBtn'),
  copiedCount:    $('copiedCount'),
};

/* ─────────────────────────────────────────────
   STATE
───────────────────────────────────────────── */
let state = {
  enabled:  true,
  history:  [],
  count:    0,
};

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
const formatTime = (iso) => {
  try {
    const d   = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60)   return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
};

const extractFilename = (url) => {
  try {
    const pathname = new URL(url).pathname;
    const parts    = pathname.split('/');
    const name     = parts[parts.length - 1] || 'image';
    return name.length > 28 ? name.slice(0, 28) + '…' : name;
  } catch { return 'image'; }
};

/* ─────────────────────────────────────────────
   RENDER
───────────────────────────────────────────── */
const renderStatus = () => {
  const enabled = state.enabled;

  if (enabled) {
    UI.app.classList.remove('app--disabled');
    UI.statusBar.classList.remove('status-bar--disabled');
    UI.statusLabel.textContent = 'Active — drag any Pinterest image';
  } else {
    UI.app.classList.add('app--disabled');
    UI.statusBar.classList.add('status-bar--disabled');
    UI.statusLabel.textContent = 'Disabled — toggle to reactivate';
  }

  UI.enableToggle.checked = enabled;
};

const renderPreview = () => {
  const last = state.history[0];
  if (!last) {
    UI.previewEmpty.style.display   = '';
    UI.previewContent.style.display = 'none';
    return;
  }

  UI.previewEmpty.style.display   = 'none';
  UI.previewContent.style.display = '';

  /* Use thumb URL for preview (low-res for fast display) */
  UI.previewImg.src = last.thumb || last.url;
  UI.previewImg.onerror = () => { UI.previewImg.src = last.url; };
  UI.previewTime.textContent = formatTime(last.timestamp);
};

const renderHistory = () => {
  const history = state.history;

  if (!history.length) {
    UI.historyEmpty.style.display = '';
    /* Clear any existing items */
    [...UI.historyList.querySelectorAll('.history-item')].forEach(el => el.remove());
    return;
  }

  UI.historyEmpty.style.display = 'none';

  /* Rebuild list (keep simple for session sizes) */
  [...UI.historyList.querySelectorAll('.history-item')].forEach(el => el.remove());

  history.forEach((entry, idx) => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.style.animationDelay = `${idx * 30}ms`;

    const thumbSrc = entry.thumb || entry.url;
    item.innerHTML = `
      <img class="history-item__thumb" src="${thumbSrc}" alt=""
           onerror="this.src='${entry.url}'" loading="lazy">
      <div class="history-item__info">
        <div class="history-item__label">${extractFilename(entry.url)}</div>
        <div class="history-item__time">${formatTime(entry.timestamp)}</div>
      </div>
      <div class="history-item__badge"></div>
    `;

    UI.historyList.appendChild(item);
  });
};

const renderCount = (animate = false) => {
  UI.copiedCount.textContent = state.count;
  if (animate) {
    UI.copiedCount.classList.add('bump');
    setTimeout(() => UI.copiedCount.classList.remove('bump'), 600);
  }
};

const render = () => {
  renderStatus();
  renderPreview();
  renderHistory();
  renderCount();
};

/* ─────────────────────────────────────────────
   LOAD STATE
───────────────────────────────────────────── */
const loadState = async () => {
  /* Load enabled flag from persistent storage */
  const stored = await chrome.storage.local.get(['enabled']);
  state.enabled = stored.enabled ?? true;

  /* Load session history from active Pinterest tab */
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('pinterest')) {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_SESSION' });
      if (response?.history) {
        state.history = response.history;
        state.count   = response.history.length;
      }
    }
  } catch {
    /* Content script not ready or not on Pinterest — silent */
  }

  render();
};

/* ─────────────────────────────────────────────
   EVENT HANDLERS
───────────────────────────────────────────── */
UI.enableToggle.addEventListener('change', async () => {
  state.enabled = UI.enableToggle.checked;
  await chrome.storage.local.set({ enabled: state.enabled });
  renderStatus();

  /* Notify active tab */
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url?.includes('pinterest')) {
      await chrome.tabs.sendMessage(tab.id, { type: 'SET_ENABLED', enabled: state.enabled });
    }
  } catch {}
});

UI.clearBtn.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url?.includes('pinterest')) {
      await chrome.tabs.sendMessage(tab.id, { type: 'CLEAR_SESSION' });
    }
  } catch {}

  state.history = [];
  state.count   = 0;

  /* Reset badge */
  chrome.runtime.sendMessage({ type: 'RESET_BADGE' }).catch(() => {});

  render();
});

/* ─────────────────────────────────────────────
   LIVE UPDATE — receive new copies from content
───────────────────────────────────────────── */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SESSION_UPDATE') {
    if (msg.history) {
      state.history = msg.history;
      state.count   = msg.history.length;
      renderPreview();
      renderHistory();
      renderCount(true);
    }
  }
});

/* ─────────────────────────────────────────────
   BOOT
───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', loadState);
