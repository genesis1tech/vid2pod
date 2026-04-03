import { describe, test, expect } from 'vitest';
import { generateRssXml } from '../src/rss/generator.js';
import { getDurationFromSeconds } from '../src/processing/metadata-extractor.js';
import { ACCEPTED_AUDIO_TYPES, PODCAST_CATEGORIES } from '../src/shared/constants.js';
import { escapeXml } from '../src/rss/generator.js';

describe('RSS Generator', () => {
  test('generates valid RSS XML with iTunes namespace', () => {
    const feed = {
      id: 'test-feed-id',
      title: 'Test Podcast',
      description: 'A test podcast feed',
      author: 'Test Author',
      email: 'test@example.com',
      websiteUrl: 'https://example.com',
      language: 'en',
      copyright: '© 2026 Test',
      feedType: 'episodic',
      categoryPrimary: 'Technology',
      categorySecondary: null,
      explicit: false,
      imageUrl: null,
      baseUrl: 'http://localhost:3000',
    };

    const xml = generateRssXml(feed);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<title>Test Podcast</title>');
    expect(xml).toContain('xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"');
    expect(xml).toContain('<itunes:author>Test Author</itunes:author>');
    expect(xml).toContain('<itunes:type>episodic</itunes:type>');
    expect(xml).toContain('<itunes:category text="Technology"/>');
    expect(xml).toContain('<itunes:explicit>no</itunes:explicit>');
  });

  test('generates episodes with enclosure tags', () => {
    const feed = {
      id: 'test-feed-id',
      title: 'Test Podcast',
      description: 'A test podcast feed',
      author: 'Test Author',
      email: null,
      websiteUrl: null,
      language: 'en',
      copyright: null,
      feedType: 'serial',
      categoryPrimary: 'Technology',
      categorySecondary: 'Podcasting',
      explicit: false,
      imageUrl: 'https://example.com/art.jpg',
      baseUrl: 'http://localhost:3000',
    };

    const episodes = [{
      episodeType: 'full',
      seasonNumber: 1,
      episodeNumber: 1,
      title: 'Episode One',
      description: 'First episode',
      enclosureUrl: 'https://example.com/ep1.mp3',
      enclosureSize: 1234567,
      enclosureType: 'audio/mpeg',
      guid: 'ep-1-guid',
      publishedAt: new Date(),
      durationSeconds: 1800,
      explicit: false,
      imageUrl: null,
      status: 'published',
    }];

    const xml = generateRssXml(feed, episodes);

    expect(xml).toContain('<itunes:image href="https://example.com/art.jpg"/>');
    expect(xml).toContain('<itunes:category text="Technology"/>');
    expect(xml).toContain('<itunes:category text="Podcasting"/>');
    expect(xml).toContain('<enclosure url="https://example.com/ep1.mp3"');
    expect(xml).toContain('<itunes:duration>30:00</itunes:duration>');
    expect(xml).toContain('<itunes:season>1</itunes:season>');
    expect(xml).toContain('<itunes:episode>1</itunes:episode>');
  });

  test('escapes XML special characters', () => {
    const feed = {
      id: 'test',
      title: 'Tom & Jerry <Podcast> "Quotes"',
      description: 'A&B <description> "test"',
      author: 'Test',
      email: null,
      websiteUrl: null,
      language: 'en',
      copyright: null,
      feedType: 'episodic',
      categoryPrimary: 'Comedy',
      categorySecondary: null,
      explicit: false,
      imageUrl: null,
      baseUrl: 'http://localhost:3000',
    };

    const xml = generateRssXml(feed);
    expect(xml).toContain('Tom &amp; Jerry &lt;Podcast&gt; &quot;Quotes&quot;');
    expect(xml).not.toContain('<Podcast>');
    expect(xml).not.toContain('A&B');
  });
});
