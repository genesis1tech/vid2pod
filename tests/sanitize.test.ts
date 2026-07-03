import { describe, test, expect } from 'vitest';
import { sanitizeFilename } from '../src/shared/sanitize.js';

describe('sanitizeFilename', () => {
  test('strips directory traversal sequences', () => {
    expect(sanitizeFilename('../../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('../../tmp/pwned.txt')).toBe('pwned.txt');
  });

  test('strips absolute paths', () => {
    expect(sanitizeFilename('/etc/shadow')).toBe('shadow');
  });

  test('neutralizes embedded separators and unusual characters', () => {
    // No path separator survives, so the result can never escape a directory.
    expect(sanitizeFilename('a/b\\c')).not.toContain('/');
    expect(sanitizeFilename('a/b\\c')).not.toContain('\\');
    expect(sanitizeFilename('evil name;rm -rf.mp3')).toBe('evil_name_rm_-rf.mp3');
  });

  test('rejects dotfile-only / empty names via fallback', () => {
    expect(sanitizeFilename('...')).toBe('upload');
    expect(sanitizeFilename('')).toBe('upload');
    expect(sanitizeFilename(null)).toBe('upload');
    expect(sanitizeFilename(undefined, 'input.mp3')).toBe('input.mp3');
  });

  test('preserves ordinary filenames', () => {
    expect(sanitizeFilename('episode-01.mp3')).toBe('episode-01.mp3');
    expect(sanitizeFilename('My_File.M4A')).toBe('My_File.M4A');
  });
});
