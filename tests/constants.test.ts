import { describe, test, expect } from 'vitest';
import { ACCEPTED_AUDIO_TYPES, PODCAST_CATEGORIES } from '../src/shared/constants.js';
import { getDurationFromSeconds } from '../src/processing/metadata-extractor.js';
import { escapeXml } from '../src/rss/generator.js';

describe('Constants', () => {
  test('ACCEPTED_AUDIO_TYPES includes standard formats', () => {
    expect(ACCEPTED_AUDIO_TYPES).toContain('audio/mpeg');
    expect(ACCEPTED_AUDIO_TYPES).toContain('audio/wav');
    expect(ACCEPTED_AUDIO_TYPES).toContain('audio/flac');
  });

  test('PODCAST_CATEGORIES includes standard categories', () => {
    expect(PODCAST_CATEGORIES).toContain('Technology');
    expect(PODCAST_CATEGORIES).toContain('Comedy');
    expect(PODCAST_CATEGORIES.length).toBeGreaterThan(10);
  });
});

describe('Duration formatting', () => {
  test('formats seconds to MM:SS', () => {
    expect(getDurationFromSeconds(125)).toBe('2:05');
    expect(getDurationFromSeconds(0)).toBe('0:00');
    expect(getDurationFromSeconds(59)).toBe('0:59');
  });

  test('formats seconds to H:MM:SS when over an hour', () => {
    expect(getDurationFromSeconds(3723)).toBe('1:02:03');
    expect(getDurationFromSeconds(3600)).toBe('1:00:00');
  });
});

describe('escapeXml', () => {
  test('escapes all XML special characters', () => {
    expect(escapeXml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    expect(escapeXml('<script>')).toBe('&lt;script&gt;');
    expect(escapeXml('"hello"')).toBe('&quot;hello&quot;');
    expect(escapeXml("it's")).toBe("it&apos;s");
  });
});
