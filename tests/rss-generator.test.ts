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

  test('excludes non-published episodes from output', () => {
    const feed = {
      id: 'test',
      title: 'My Library',
      description: 'Personal feed',
      author: 'Me',
      email: null,
      websiteUrl: null,
      language: 'en',
      copyright: null,
      feedType: 'episodic',
      categoryPrimary: 'Technology',
      categorySecondary: null,
      explicit: false,
      imageUrl: null,
      baseUrl: 'http://localhost:3000',
    };

    const episodes = [
      { title: 'Published Ep', description: 'Yes', guid: 'g1', status: 'published', enclosureUrl: 'http://x/a.mp3', enclosureSize: 100, enclosureType: 'audio/mpeg', durationSeconds: 60, explicit: false, episodeType: 'full', publishedAt: new Date() },
      { title: 'Draft Ep', description: 'No', guid: 'g2', status: 'draft', enclosureUrl: null, enclosureSize: null, enclosureType: 'audio/mpeg', durationSeconds: null, explicit: false, episodeType: 'full', publishedAt: null },
      { title: 'Scheduled Ep', description: 'No', guid: 'g3', status: 'scheduled', enclosureUrl: 'http://x/b.mp3', enclosureSize: 200, enclosureType: 'audio/mpeg', durationSeconds: 120, explicit: false, episodeType: 'full', publishedAt: null },
    ];

    const xml = generateRssXml(feed, episodes);
    expect(xml).toContain('Published Ep');
    expect(xml).not.toContain('Draft Ep');
    expect(xml).not.toContain('Scheduled Ep');
  });

  test('handles episode without enclosure url', () => {
    const feed = {
      id: 'test',
      title: 'My Library',
      description: 'Personal feed',
      author: 'Me',
      email: null,
      websiteUrl: null,
      language: 'en',
      copyright: null,
      feedType: 'episodic',
      categoryPrimary: 'Technology',
      categorySecondary: null,
      explicit: false,
      imageUrl: null,
      baseUrl: 'http://localhost:3000',
    };

    const episodes = [
      { title: 'No Audio Yet', description: 'Pending', guid: 'g1', status: 'published', enclosureUrl: null, enclosureSize: null, enclosureType: 'audio/mpeg', durationSeconds: null, explicit: false, episodeType: 'full', publishedAt: new Date() },
    ];

    const xml = generateRssXml(feed, episodes);
    expect(xml).toContain('<title>No Audio Yet</title>');
    expect(xml).not.toContain('<enclosure');
    expect(xml).toContain('<itunes:duration>0:00</itunes:duration>');
  });

  test('generates feed with no episodes', () => {
    const feed = {
      id: 'test',
      title: 'Empty Feed',
      description: 'Nothing here yet',
      author: 'Me',
      email: null,
      websiteUrl: null,
      language: 'en',
      copyright: null,
      feedType: 'episodic',
      categoryPrimary: 'Education',
      categorySecondary: null,
      explicit: false,
      imageUrl: null,
      baseUrl: 'http://localhost:3000',
    };

    const xml = generateRssXml(feed, []);
    expect(xml).toContain('<title>Empty Feed</title>');
    expect(xml).not.toContain('<item>');
    expect(xml).toContain('</channel>');
    expect(xml).toContain('</rss>');
  });

  test('builds correct self-referencing feed URL', () => {
    const feed = {
      id: 'test',
      title: 'My Feed',
      description: 'Test',
      author: 'Me',
      email: null,
      websiteUrl: null,
      language: 'en',
      copyright: null,
      feedType: 'episodic',
      categoryPrimary: 'Technology',
      categorySecondary: null,
      explicit: false,
      imageUrl: null,
      baseUrl: 'http://localhost:3000',
      ownershipToken: 'abc123',
    };

    const xml = generateRssXml(feed);
    // When no websiteUrl, <link> should point to the feed URL
    expect(xml).toContain('<link>http://localhost:3000/feed/abc123.xml</link>');
  });
});
