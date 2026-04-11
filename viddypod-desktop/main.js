import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-shell';

const dot = document.getElementById('dot');
const statusText = document.getElementById('status-text');
const emailEl = document.getElementById('email');
const signinBtn = document.getElementById('signin-btn');
const signoutBtn = document.getElementById('signout-btn');
const downloadsEl = document.getElementById('downloads');
const extDot = document.getElementById('ext-dot');
const extStatusText = document.getElementById('ext-status-text');
const pairTokenEl = document.getElementById('pair-token');
const copyTokenBtn = document.getElementById('copy-token');
const syncMetaEl = document.getElementById('sync-meta');

const SERVER = 'https://vid2pod.g1tech.cloud';

async function refreshStatus() {
  try {
    const status = await invoke('get_status');

    // Server sign-in state
    if (status.signed_in) {
      dot.className = 'dot connected';
      statusText.textContent = status.processing ? 'Downloading...' : 'Connected';
      if (status.processing) dot.className = 'dot working';
      emailEl.textContent = status.email || '';
      signinBtn.style.display = 'none';
      signoutBtn.style.display = 'inline-block';
    } else {
      dot.className = 'dot disconnected';
      statusText.textContent = 'Not signed in';
      emailEl.textContent = '';
      signinBtn.style.display = 'inline-block';
      signoutBtn.style.display = 'none';
    }

    // Browser extension state
    if (status.extension_connected) {
      extDot.className = 'dot connected';
      extStatusText.textContent = `Extension: connected (${status.cookie_count} cookies)`;
    } else {
      extDot.className = 'dot disconnected';
      extStatusText.textContent = 'Extension: not connected';
    }
    pairTokenEl.textContent = status.pair_token || '—';
    if (status.last_cookie_sync) {
      syncMetaEl.textContent = `Last sync: ${formatTime(status.last_cookie_sync)}`;
    } else {
      syncMetaEl.textContent = 'No cookies synced yet';
    }

    // Recent downloads
    if (status.recent_downloads && status.recent_downloads.length > 0) {
      downloadsEl.innerHTML = status.recent_downloads.map(d => `
        <div class="download-item">
          <div class="title">${escape(d.title)}</div>
          <div class="meta">${escape(d.status)} · ${formatTime(d.completed_at)}</div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Failed to get status:', err);
  }
}

function escape(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function formatTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return date.toLocaleTimeString();
}

signinBtn.addEventListener('click', async () => {
  await open(`${SERVER}/agent-connect`);
});

signoutBtn.addEventListener('click', async () => {
  await invoke('sign_out');
  refreshStatus();
});

copyTokenBtn.addEventListener('click', async () => {
  const token = pairTokenEl.textContent;
  if (!token || token === '—' || token === 'loading...') return;
  try {
    await navigator.clipboard.writeText(token);
    const original = copyTokenBtn.textContent;
    copyTokenBtn.textContent = 'Copied!';
    setTimeout(() => { copyTokenBtn.textContent = original; }, 1500);
  } catch (e) {
    console.error('Copy failed:', e);
  }
});

listen('status-updated', () => refreshStatus());

refreshStatus();
setInterval(refreshStatus, 5000);
