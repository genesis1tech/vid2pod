const pingDot = document.getElementById('ping-dot');
const pingLabel = document.getElementById('ping-label');
const pairDot = document.getElementById('pair-dot');
const pairLabel = document.getElementById('pair-label');
const tokenInput = document.getElementById('token-input');
const saveBtn = document.getElementById('save-btn');
const clearBtn = document.getElementById('clear-btn');
const syncBtn = document.getElementById('sync-btn');
const syncMeta = document.getElementById('sync-meta');

function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => resolve(response));
  });
}

async function refresh() {
  const status = await send({ type: 'getStatus' });
  if (!status) return;

  // Agent reachability
  if (status.ping && status.ping.reachable) {
    pingDot.className = 'dot ok';
    if (status.ping.authed) {
      pingLabel.textContent = 'Agent reachable (authenticated)';
    } else {
      pingLabel.textContent = `Agent reachable (auth ${status.ping.status || 'failed'})`;
    }
  } else {
    pingDot.className = 'dot bad';
    pingLabel.textContent = 'Agent unreachable (is ViddyPod running?)';
  }

  // Pairing
  if (status.paired) {
    pairDot.className = 'dot ok';
    pairLabel.textContent = 'Paired';
  } else {
    pairDot.className = 'dot bad';
    pairLabel.textContent = 'Not paired';
  }

  // Last sync
  if (status.lastSync) {
    const ts = new Date(status.lastSync.at).toLocaleTimeString();
    if (status.lastSync.ok) {
      syncMeta.textContent = `Last sync: ${ts} · ${status.lastSync.count} cookies`;
    } else {
      syncMeta.textContent = `Last sync failed: ${ts}`;
    }
  } else {
    syncMeta.textContent = 'No syncs yet';
  }
}

saveBtn.addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  if (!token) return;
  await send({ type: 'setPairToken', token });
  tokenInput.value = '';
  setTimeout(refresh, 500);
});

clearBtn.addEventListener('click', async () => {
  await send({ type: 'clearPairToken' });
  refresh();
});

syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  syncBtn.textContent = 'Syncing...';
  await send({ type: 'syncNow' });
  syncBtn.disabled = false;
  syncBtn.textContent = 'Sync now';
  refresh();
});

refresh();
setInterval(refresh, 3000);
