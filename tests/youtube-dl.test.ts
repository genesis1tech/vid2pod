import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  execFile: vi.fn((...args: any[]) => {
    const cb = args[args.length - 1];
    cb(null, '', '');
  }),
}));

vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockRejectedValue(new Error('no cookies')),
  readdir: vi.fn().mockResolvedValue(['dQw4w9WgXcQ.webm', 'dQw4w9WgXcQ.info.json']),
  readFile: vi.fn().mockResolvedValue(JSON.stringify({
    title: 'Test title',
    description: 'Test description',
    duration: 123,
    uploader: 'Uploader',
    upload_date: '20240101',
    thumbnail: 'https://example.com/thumb.jpg',
  })),
}));

import { execFile } from 'child_process';
import { extractVideoId, downloadAudio } from '../src/processing/youtube-dl.js';

describe('extractVideoId', () => {
  test('extracts from standard watch URL', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('extracts from short URL', () => {
    expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('extracts from embed URL', () => {
    expect(extractVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('extracts from URL with extra params', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120&list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf')).toBe('dQw4w9WgXcQ');
  });

  test('extracts bare video ID', () => {
    expect(extractVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('returns null for invalid URL', () => {
    expect(extractVideoId('https://example.com/not-youtube')).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(extractVideoId('')).toBeNull();
  });

  test('returns null for URL with wrong video ID length', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=short')).toBeNull();
  });
});

describe('downloadAudio', () => {
  beforeEach(() => {
    vi.mocked(execFile).mockClear();
  });

  test('downloads best audio without forcing an mp3 transcode', async () => {
    const result = await downloadAudio('dQw4w9WgXcQ');

    expect(result.audioPath).toContain('dQw4w9WgXcQ.webm');
    expect(result.metadata.title).toBe('Test title');
    expect(vi.mocked(execFile)).toHaveBeenCalledTimes(1);

    const [, args] = vi.mocked(execFile).mock.calls[0];
    expect(args).toContain('--format');
    expect(args).toContain('bestaudio/best');
    expect(args).not.toContain('--extract-audio');
    expect(args).not.toContain('--audio-format');
    expect(args).not.toContain('mp3');
  });
});
