import { execFile } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdir } from 'fs/promises';
import { v4 as uuid } from 'uuid';
import { createChildLogger } from '../shared/logger.js';

const execFileAsync = promisify(execFile);
const log = createChildLogger('youtube-dl');

export interface YtDlpResult {
  audioPath: string;
  workDir: string;
  metadata: {
    title: string;
    description: string;
    duration: number;
    uploader: string;
    uploadDate: string;
    thumbnail: string | null;
  };
}

export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export async function downloadAudio(videoId: string): Promise<YtDlpResult> {
  const workDir = join(tmpdir(), `vid2pod-yt-${uuid()}`);
  await mkdir(workDir, { recursive: true });

  const outputTemplate = join(workDir, '%(id)s.%(ext)s');

  log.info({ videoId, workDir }, 'Starting YouTube audio download');

  // Build yt-dlp args
  const args = [
    '--format', 'bestaudio/best',
    '--output', outputTemplate,
    '--write-info-json',
    '--no-playlist',
    '--no-overwrites',
    '--js-runtimes', 'node',
    '--remote-components', 'ejs:github',
  ];

  // Use cookies file if available (for authenticated downloads)
  const cookiesPath = join(process.cwd(), 'cookies.txt');
  try {
    const { access } = await import('fs/promises');
    await access(cookiesPath);
    args.push('--cookies', cookiesPath);
    log.info('Using cookies.txt for YouTube authentication');
  } catch {
    // No cookies file, proceed without
  }

  args.push(`https://www.youtube.com/watch?v=${videoId}`);

  // Download audio-only, best quality, convert to mp3
  await execFileAsync('yt-dlp', args, {
    cwd: workDir,
    timeout: 300_000, // 5 min timeout
  });

  // Read the metadata json yt-dlp wrote
  const { readFile, readdir } = await import('fs/promises');
  const files = await readdir(workDir);
  const audioFile = files.find(f => !f.endsWith('.info.json'));
  const infoFile = files.find(f => f.endsWith('.info.json'));

  if (!audioFile) {
    throw new Error(`yt-dlp did not produce an audio file in ${workDir}`);
  }

  let metadata: YtDlpResult['metadata'] = {
    title: videoId,
    description: '',
    duration: 0,
    uploader: '',
    uploadDate: '',
    thumbnail: null,
  };

  if (infoFile) {
    const raw = JSON.parse(await readFile(join(workDir, infoFile), 'utf-8'));
    metadata = {
      title: raw.title || videoId,
      description: raw.description || '',
      duration: raw.duration || 0,
      uploader: raw.uploader || raw.channel || '',
      uploadDate: raw.upload_date || '',
      thumbnail: raw.thumbnail || null,
    };
  }

  const audioPath = join(workDir, audioFile);
  log.info({ videoId, audioPath, duration: metadata.duration }, 'YouTube audio download complete');

  return { audioPath, workDir, metadata };
}
