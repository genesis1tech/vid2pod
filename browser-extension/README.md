# ViddyPod Cookie Bridge Extension

Companion browser extension for the ViddyPod Desktop Agent on Windows. Syncs YouTube cookies from your browser to the local agent so yt-dlp can download videos that require sign-in (age-restricted, member-only, private, or rate-limited content) — **while your browser stays open**.

Works in any Chromium-based browser: Chrome, Edge, Brave, Vivaldi, Opera, Arc.

## Why this exists

Chrome 127+ (and Edge, Brave, etc.) introduced AppBound cookie encryption on Windows. `yt-dlp --cookies-from-browser chrome` no longer works against a running Chromium browser. This extension sidesteps the issue entirely by pushing cookies via the `chrome.cookies` API over a localhost HTTP channel.

## Install (developer mode — until we publish to the store)

1. Open `chrome://extensions` (or `edge://extensions` / `brave://extensions`)
2. Toggle **Developer mode** on (top right)
3. Click **Load unpacked**
4. Select the `browser-extension/` directory from this repo
5. The extension icon appears in the toolbar

## Pair with the agent (first-time setup)

1. Make sure the ViddyPod Desktop Agent is running (tray icon)
2. Click the tray icon → the agent window shows a **Pair token** under "Browser Extension"
3. Click the **Copy** button next to the token
4. Click the extension icon in your browser toolbar to open its popup
5. Paste the token into the "Paste pair token" field
6. Click **Save**
7. Within a few seconds:
   - Popup should show **Agent reachable (authenticated)** with a green dot
   - Popup should show **Paired** with a green dot
   - Popup should show "Last sync: HH:MM:SS · N cookies"
8. Done. From now on, any cookie change on `youtube.com` / `google.com` / `googlevideo.com` is pushed to the agent automatically (debounced 3 s). There's also a 10-minute heartbeat resync.

## How it works

- **Permissions**: `cookies` (to read cookies), `storage` (to remember the pair token), `alarms` (for the heartbeat)
- **Host permissions**: `*.youtube.com`, `*.google.com`, `*.googlevideo.com` (YouTube signin cookies live across these), and `127.0.0.1` (the agent's local HTTP server)
- **Endpoint**: `http://127.0.0.1:17421/cookies` with `Authorization: Bearer <pair_token>`
- **Format**: browser cookies are posted as JSON; the agent converts them to Netscape `cookies.txt` for yt-dlp
- **Security**: server binds to localhost only, requires both a valid pair token and an extension Origin header

## Troubleshooting

- **"Agent unreachable"** — the ViddyPod Desktop Agent isn't running. Launch it from the Start menu. The agent serves `http://127.0.0.1:17421/ping` — you can test in your browser address bar (it'll 403 without an extension Origin, but at least confirms it's listening).
- **"Auth failed"** — the pair token in the extension doesn't match the agent's. Click **Clear** in the popup, copy a fresh token from the agent window, paste, Save.
- **"No syncs yet"** after pairing — click **Sync now** to force a push. Also try reloading YouTube in a tab so the cookie listener fires.
- **Cookies expire** — YouTube sign-in cookies rotate every few days. As long as you stay signed in to YouTube in your browser, the extension auto-pushes fresh cookies. If the agent starts hitting auth errors again, reload YouTube in a tab.

## Files

- `manifest.json` — MV3 manifest
- `background.js` — service worker: cookie listener, debounce, HTTP push, messaging
- `popup.html` / `popup.js` — pairing UI and status panel
- `icons/` — extension icons
