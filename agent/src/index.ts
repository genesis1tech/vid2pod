#!/usr/bin/env bun
/**
 * ViddyPod Agent
 *
 * Downloads YouTube audio from your machine (residential IP),
 * then uploads to the ViddyPod server for processing.
 *
 * Usage:
 *   ./viddypod-agent
 *   # On first run, paste the setup token from the ViddyPod web UI
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, readdir, mkdir, rm, writeFile, access } from 'fs/promises';
import { join } from 'path';
import { tmpdir, homedir, platform } from 'os';
import { randomUUID } from 'crypto';
import { createInterface } from 'readline';

const execFileAsync = promisify(execFile);

const CONFIG_DIR = join(homedir(), '.viddypod');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
const POLL_INTERVAL = 30_000; // 30 seconds

interface Config {
  server: string;
  token: string;
}

// ─── Logging ────────────────────────────────────

function log(msg: string, data?: any) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`, data ? JSON.stringify(data) : '');
}

function logError(msg: string, data?: any) {
  const ts = new Date().toISOString().slice(11, 19);
  console.error(`[${ts}] ERROR: ${msg}`, data ? JSON.stringify(data) : '');
}

// ─── Config ─────────────────────────────────────

async function loadConfig(): Promise<Config | null> {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveConfig(config: Config) {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function setup(): Promise<Config> {
  console.log('');
  console.log('  ViddyPod Agent Setup');
  console.log('  ────────────────────');
  console.log('');
  console.log('  Paste the setup token from the ViddyPod web UI.');
  console.log('  (Go to your library → Agent Setup → Copy token)');
  console.log('');

  const setupToken = await prompt('  Setup token: ');
  if (!setupToken.includes('|')) {
    console.error('  Invalid token format. Expected: server_url|auth_token');
    process.exit(1);
  }

  const [server, token] = setupToken.split('|', 2);
  const config: Config = { server, token };

  // Verify connection
  try {
    const res = await fetch(`${server}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log(`  Connected to ${server}`);
  } catch (err: any) {
    console.error(`  Cannot reach server: ${err.message}`);
    process.exit(1);
  }

  await saveConfig(config);
  console.log(`  Config saved to ${CONFIG_PATH}`);
  console.log('');
  return config;
}

// ─── Browser Detection ──────────────────────────

function detectBrowser(): string {
  const os = platform();
  if (os === 'darwin') return 'chrome';
  if (os === 'win32') return 'chrome';
  return 'chrome'; // Default to chrome on Linux too
}

// ─── YouTube Download ───────────────────────────

interface DownloadResult {
  audioPath: string;
  workDir: string;
  metadata: {
    title: string;
    description: string;
    duration: number;
    thumbnail: string | null;
  };
}

async function downloadAudio(videoId: string): Promise<DownloadResult> {
  const workDir = join(tmpdir(), `viddypod-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  const outputTemplate = join(workDir, '%(id)s.%(ext)s');
  const browser = detectBrowser();

  log('Downloading', { videoId, browser });

  await execFileAsync('yt-dlp', [
    '--extract-audio',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    '--output', outputTemplate,
    '--write-info-json',
    '--no-playlist',
    '--no-overwrites',
    '--cookies-from-browser', browser,
    `https://www.youtube.com/watch?v=${videoId}`,
  ], {
    cwd: workDir,
    timeout: 600_000, // 10 min
  });

  const files = await readdir(workDir);
  const audioFile = files.find(f => f.endsWith('.mp3'));
  const infoFile = files.find(f => f.endsWith('.info.json'));

  if (!audioFile) throw new Error('yt-dlp did not produce an mp3 file');

  let metadata: DownloadResult['metadata'] = {
    title: videoId,
    description: '',
    duration: 0,
    thumbnail: null,
  };

  if (infoFile) {
    const raw = JSON.parse(await readFile(join(workDir, infoFile), 'utf-8'));
    metadata = {
      title: raw.title || videoId,
      description: raw.description || '',
      duration: raw.duration || 0,
      thumbnail: raw.thumbnail || null,
    };
  }

  const audioPath = join(workDir, audioFile);
  log('Downloaded', { videoId, title: metadata.title, duration: metadata.duration });

  return { audioPath, workDir, metadata };
}

// ─── API Client ─────────────────────────────────

async function apiFetch(config: Config, path: string, options?: RequestInit): Promise<any> {
  const res = await fetch(`${config.server}${path}`, {
    ...options,
    headers: {
      ...(options?.headers as Record<string, string>),
      'Authorization': `Bearer ${config.token}`,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as any;
    throw new Error(`HTTP ${res.status}: ${body.message || body.error || 'Request failed'}`);
  }
  return res.json();
}

async function getPendingDownloads(config: Config): Promise<any[]> {
  try {
    return await apiFetch(config, '/api/v1/agent/pending');
  } catch (err: any) {
    logError('Failed to fetch pending downloads', { error: err.message });
    return [];
  }
}

async function uploadAudio(config: Config, assetId: string, audioPath: string, metadata: DownloadResult['metadata']) {
  const audioBuffer = await readFile(audioPath);
  const filename = audioPath.split('/').pop() || 'audio.mp3';

  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), filename);
  formData.append('title', metadata.title);
  formData.append('description', metadata.description || metadata.title);
  formData.append('duration', String(metadata.duration || 0));
  if (metadata.thumbnail) {
    formData.append('thumbnail', metadata.thumbnail);
  }

  log('Uploading', { assetId, title: metadata.title, size: audioBuffer.length });

  const res = await fetch(`${config.server}/api/v1/agent/upload/${assetId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${config.token}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(`Upload failed: ${res.status} ${err.message || ''}`);
  }

  const result = await res.json();
  log('Uploaded', { assetId, status: result.status });
  return result;
}

// ─── Main Loop ──────────────────────────────────

async function processOne(config: Config, asset: any) {
  const videoId = asset.youtubeVideoId;
  if (!videoId) {
    log('Skipping asset without videoId', { assetId: asset.id });
    return;
  }

  try {
    const { audioPath, workDir, metadata } = await downloadAudio(videoId);
    await uploadAudio(config, asset.id, audioPath, metadata);
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  } catch (err: any) {
    logError('Failed to process', { videoId, error: err.message });
  }
}

async function poll(config: Config) {
  try {
    const pending = await getPendingDownloads(config);
    if (pending.length > 0) {
      log(`Found ${pending.length} pending download(s)`);
      for (const asset of pending) {
        await processOne(config, asset);
      }
    }
  } catch (err: any) {
    logError('Poll error', { error: err.message });
  }
}

async function main() {
  let config = await loadConfig();

  if (!config) {
    config = await setup();
  }

  console.log('');
  console.log('  ViddyPod Agent');
  console.log(`  Server:   ${config.server}`);
  console.log(`  Polling:  every ${POLL_INTERVAL / 1000}s`);
  console.log('');

  // Initial poll
  await poll(config);

  // Continue polling
  setInterval(() => poll(config!), POLL_INTERVAL);
  log(`Agent running — keep this window open`);
}

main().catch((err) => {
  console.error('Agent failed to start:', err.message);
  process.exit(1);
});
