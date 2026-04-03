#!/usr/bin/env node

/**
 * Vid2Pod Local Agent
 *
 * Runs on your machine, polls the server for pending YouTube downloads,
 * uses yt-dlp with your browser's cookies to download audio locally,
 * then uploads the result to the server for processing.
 *
 * Usage:
 *   node agent/vid2pod-agent.mjs --server https://vid2pod.g1tech.cloud --email you@email.com --password yourpass
 *
 *   Or set environment variables:
 *     VID2POD_SERVER=https://vid2pod.g1tech.cloud
 *     VID2POD_EMAIL=you@email.com
 *     VID2POD_PASSWORD=yourpass
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, readdir, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir, homedir } from 'os';
import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';

const execFileAsync = promisify(execFile);

// Parse args
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const SERVER = getArg('server') || process.env.VID2POD_SERVER || 'https://vid2pod.g1tech.cloud';
const EMAIL = getArg('email') || process.env.VID2POD_EMAIL;
const PASSWORD = getArg('password') || process.env.VID2POD_PASSWORD;
const POLL_INTERVAL = parseInt(getArg('interval') || process.env.VID2POD_POLL_INTERVAL || '30', 10) * 1000;
const BROWSER = getArg('browser') || process.env.VID2POD_BROWSER || 'chrome';
const DOWNLOAD_DIR = getArg('download-dir') || process.env.VID2POD_DOWNLOAD_DIR || join(homedir(), 'Vid2Pod');

if (!EMAIL || !PASSWORD) {
  console.error('Usage: vid2pod-agent --server URL --email EMAIL --password PASSWORD');
  console.error('  Or set VID2POD_SERVER, VID2POD_EMAIL, VID2POD_PASSWORD environment variables');
  process.exit(1);
}

let token = null;

function log(msg, data) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`, data ? JSON.stringify(data) : '');
}

async function login() {
  const res = await fetch(`${SERVER}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const data = await res.json();
  token = data.accessToken;
  log('Logged in', { email: EMAIL });
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${SERVER}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'Authorization': `Bearer ${token}`,
    },
  });
  if (res.status === 401) {
    // Token expired, re-login
    await login();
    return apiFetch(path, options);
  }
  return res;
}

async function getPendingDownloads() {
  const res = await apiFetch('/api/v1/agent/pending');
  if (!res.ok) return [];
  return res.json();
}

async function downloadAudio(videoId) {
  const workDir = join(tmpdir(), `vid2pod-local-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  const outputTemplate = join(workDir, '%(id)s.%(ext)s');

  log('Downloading', { videoId });

  await execFileAsync('yt-dlp', [
    '--extract-audio',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    '--output', outputTemplate,
    '--write-info-json',
    '--no-playlist',
    '--no-overwrites',
    '--cookies-from-browser', BROWSER,
    `https://www.youtube.com/watch?v=${videoId}`,
  ], {
    cwd: workDir,
    timeout: 600_000, // 10 min
  });

  const files = await readdir(workDir);
  const audioFile = files.find(f => f.endsWith('.mp3'));
  const infoFile = files.find(f => f.endsWith('.info.json'));

  if (!audioFile) throw new Error('yt-dlp did not produce an mp3 file');

  let metadata = { title: videoId, description: '', duration: 0, thumbnail: null };
  if (infoFile) {
    const raw = JSON.parse(await readFile(join(workDir, infoFile), 'utf-8'));
    metadata = {
      title: raw.title || videoId,
      description: raw.description || '',
      duration: raw.duration || 0,
      thumbnail: raw.thumbnail || null,
    };
  }

  // Also save to local download dir for reference
  await mkdir(DOWNLOAD_DIR, { recursive: true });

  const audioPath = join(workDir, audioFile);
  log('Downloaded', { videoId, title: metadata.title, duration: metadata.duration });

  return { audioPath, workDir, metadata };
}

async function uploadAudio(assetId, audioPath, metadata) {
  const audioBuffer = await readFile(audioPath);
  const filename = audioPath.split('/').pop();

  // Build multipart form data
  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), filename);
  formData.append('title', metadata.title);
  formData.append('description', metadata.description || metadata.title);
  formData.append('duration', String(metadata.duration || 0));
  if (metadata.thumbnail) {
    formData.append('thumbnail', metadata.thumbnail);
  }

  log('Uploading', { assetId, title: metadata.title, size: audioBuffer.length });

  const res = await apiFetch(`/api/v1/agent/upload/${assetId}`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Upload failed: ${res.status} ${err.message || ''}`);
  }

  const result = await res.json();
  log('Uploaded', { assetId, status: result.status });
  return result;
}

async function processOne(asset) {
  const videoId = asset.youtubeVideoId;
  if (!videoId) {
    log('Skipping asset without videoId', { assetId: asset.id });
    return;
  }

  try {
    const { audioPath, workDir, metadata } = await downloadAudio(videoId);
    await uploadAudio(asset.id, audioPath, metadata);
    // Cleanup temp dir
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  } catch (err) {
    log('Failed', { videoId, error: err.message });
  }
}

async function poll() {
  try {
    const pending = await getPendingDownloads();
    if (pending.length > 0) {
      log(`Found ${pending.length} pending download(s)`);
      for (const asset of pending) {
        await processOne(asset);
      }
    }
  } catch (err) {
    log('Poll error', { error: err.message });
  }
}

// Main
async function main() {
  console.log('');
  console.log('  Vid2Pod Local Agent');
  console.log(`  Server:   ${SERVER}`);
  console.log(`  Browser:  ${BROWSER}`);
  console.log(`  Interval: ${POLL_INTERVAL / 1000}s`);
  console.log(`  Downloads: ${DOWNLOAD_DIR}`);
  console.log('');

  await login();

  // Initial poll
  await poll();

  // Continue polling
  setInterval(poll, POLL_INTERVAL);
  log(`Polling every ${POLL_INTERVAL / 1000}s — keep this running`);
}

main().catch((err) => {
  console.error('Agent failed to start:', err.message);
  process.exit(1);
});
