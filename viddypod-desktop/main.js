import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-shell';

const dot = document.getElementById('dot');
const statusText = document.getElementById('status-text');
const emailEl = document.getElementById('email');
const signinBtn = document.getElementById('signin-btn');
const signoutBtn = document.getElementById('signout-btn');
const downloadsEl = document.getElementById('downloads');

const SERVER = 'https://vid2pod.g1tech.cloud';

async function refreshStatus() {
  try {
    const status = await invoke('get_status');
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
    if (status.recent_downloads && status.recent_downloads.length > 0) {
      downloadsEl.innerHTML = status.recent_downloads.map(d => `
        <div class="download-item">
          <div class="title">${escape(d.title)}</div>
          <div class="meta">${d.status} · ${formatTime(d.completed_at)}</div>
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
  // Open the agent-connect page in the user's browser.
  // The web app will require login, then redirect to viddypod://callback?token=...
  await open(`${SERVER}/agent-connect`);
});

signoutBtn.addEventListener('click', async () => {
  await invoke('sign_out');
  refreshStatus();
});

// Listen for status updates from the Rust core
listen('status-updated', () => refreshStatus());

// Initial load + periodic refresh
refreshStatus();
setInterval(refreshStatus, 5000);
