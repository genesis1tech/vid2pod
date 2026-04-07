# ViddyPod Desktop Agent

A Tauri 2 desktop application that downloads YouTube videos for your ViddyPod personal podcast feed. Runs in the background, lives in the menu bar, auto-starts on login.

## Architecture

- **Rust core** (`src-tauri/src/`)
  - `lib.rs` — Tauri setup, system tray, deep link handler, command exports
  - `state.rs` — App state (token, processing status, recent downloads)
  - `auth.rs` — OS keychain token storage via `keyring` crate
  - `downloader.rs` — Wraps the bundled `yt-dlp` sidecar binary
  - `uploader.rs` — Multipart upload to `/api/v1/agent/upload/:id`
  - `poller.rs` — Background loop polling `/api/v1/agent/pending` every 30s
- **Frontend** (`index.html`, `main.js`) — Minimal status panel UI shown when user clicks the tray icon
- **Bundled binaries** (`src-tauri/binaries/`) — `yt-dlp` standalone binary per platform (gitignored)

## Authentication

1. User clicks "Sign In" → opens `https://vid2pod.g1tech.cloud/api/v1/auth/agent-callback?redirect=viddypod://callback`
2. ViddyPod web app authenticates user (Clerk or web session) and generates a long-lived `v2p_*` agent token
3. Server redirects to `viddypod://callback?token=...`
4. macOS/Windows deep link handler captures the URL → Rust extracts token → saves to OS keychain
5. Background poller starts using the token

## Setup

```bash
# Install dependencies
npm install

# Download yt-dlp binaries (per platform)
mkdir -p src-tauri/binaries
curl -L -o src-tauri/binaries/yt-dlp-aarch64-apple-darwin \
  https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos
chmod +x src-tauri/binaries/yt-dlp-aarch64-apple-darwin

# Run in dev mode (hot reload)
npx tauri dev

# Build for production (.dmg on macOS)
npx tauri build
```

## yt-dlp binary naming

Tauri sidecar convention: `yt-dlp-<rust target triple>`. Required binaries:
- `yt-dlp-aarch64-apple-darwin` — macOS Apple Silicon
- `yt-dlp-x86_64-apple-darwin` — macOS Intel
- `yt-dlp-x86_64-pc-windows-msvc.exe` — Windows
- `yt-dlp-x86_64-unknown-linux-gnu` — Linux x86_64

The macOS binary from yt-dlp's GitHub releases is a universal binary (works for both arm64 and x86_64), so the same file can be used for both targets.

## Production builds

For Apple Gatekeeper (no security warnings on macOS), the .app bundle must be signed with an Apple Developer ID and notarized via `xcrun notarytool`.

For Windows SmartScreen, sign the .msi with a code-signing certificate.
