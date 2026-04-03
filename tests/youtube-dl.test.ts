import { describe, test, expect } from 'vitest';
import { extractVideoId } from '../src/processing/youtube-dl.js';

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
