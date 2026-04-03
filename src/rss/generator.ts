import { getDb } from '../db/client.js';
import { episodes } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { createChildLogger } from '../shared/logger.js';
import { getDurationFromSeconds } from '../processing/metadata-extractor.js';

const log = createChildLogger('generator');

interface NormalizedFeed {
  id: string;
  title: string;
  subtitle?: string | null;
  description: string;
  author: string;
  email?: string | null;
  websiteUrl?: string | null;
  language: string;
  copyright?: string | null;
  imageUrl?: string | null;
  categoryPrimary: string;
  categorySecondary?: string | null;
  explicit: boolean;
  feedType: string;
  ownershipToken: string;
  baseUrl: string;
}

interface NormalizedEpisode {
  id: string;
  title: string;
  subtitle?: string | null;
  description: string;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  episodeType: string;
  enclosureUrl?: string | null;
  enclosureSize?: number | null;
  enclosureType: string;
  durationSeconds?: number | null;
  imageUrl?: string | null;
  explicit: boolean;
  guid: string;
  publishedAt?: Date | null;
  status: string;
  sortOrder: number;
}

function normalizeFeed(raw: any): NormalizedFeed {
  return {
    id: raw.id,
    title: raw.title,
    subtitle: raw.subtitle ?? raw.subtitle_text ?? null,
    description: raw.description,
    author: raw.author ?? raw.author_name ?? '',
    email: raw.email ?? raw.owner_email ?? null,
    websiteUrl: raw.websiteUrl ?? raw.website_url ?? raw.link ?? null,
    language: raw.language ?? 'en',
    copyright: raw.copyright ?? null,
    imageUrl: raw.imageUrl ?? raw.image_url ?? raw.image ?? null,
    categoryPrimary: raw.categoryPrimary ?? raw.category_primary ?? '',
    categorySecondary: raw.categorySecondary ?? raw.category_secondary ?? null,
    explicit: raw.explicit ?? false,
    feedType: raw.feedType ?? raw.feed_type ?? 'episodic',
    ownershipToken: raw.ownershipToken ?? raw.ownership_token ?? '',
    baseUrl: raw.baseUrl ?? raw.base_url ?? '',
  };
}

function normalizeEpisode(raw: any): NormalizedEpisode {
  return {
    id: raw.id,
    title: raw.title,
    subtitle: raw.subtitle ?? raw.subtitle_text ?? null,
    description: raw.description,
    seasonNumber: raw.seasonNumber ?? raw.season_number ?? null,
    episodeNumber: raw.episodeNumber ?? raw.episode_number ?? null,
    episodeType: raw.episodeType ?? raw.episode_type ?? 'full',
    enclosureUrl: raw.enclosureUrl ?? raw.enclosure_url ?? null,
    enclosureSize: raw.enclosureSize ?? raw.enclosure_size ?? null,
    enclosureType: raw.enclosureType ?? raw.enclosure_type ?? 'audio/mpeg',
    durationSeconds: raw.durationSeconds ?? raw.duration_seconds ?? null,
    imageUrl: raw.imageUrl ?? raw.image_url ?? null,
    explicit: raw.explicit ?? false,
    guid: raw.guid,
    publishedAt: raw.publishedAt ?? raw.published_at ?? null,
    status: raw.status ?? 'draft',
    sortOrder: raw.sortOrder ?? raw.sort_order ?? 0,
  };
}

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateRssXml(feedRaw: any, episodesRaw?: any[]): string {
  const feed = normalizeFeed(feedRaw);
  const items = (episodesRaw ?? []).map(normalizeEpisode);

  const ITUNES_NS = 'http://www.itunes.com/dtds/podcast-1.0.dtd';
  const CONTENT_NS = 'http://purl.org/rss/1.0/modules/content/';
  const PODCAST_NS = 'https://podcastindex.org/namespace/1.0';

  const feedUrl = `${feed.baseUrl}/feed/${feed.ownershipToken}.xml`;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<rss version="2.0"\n`;
  xml += `  xmlns:itunes="${ITUNES_NS}"\n`;
  xml += `  xmlns:content="${CONTENT_NS}"\n`;
  xml += `  xmlns:podcast="${PODCAST_NS}"\n`;
  xml += `>\n`;
  xml += `  <channel>\n`;
  xml += `    <title>${escapeXml(feed.title)}</title>\n`;
  xml += `    <link>${escapeXml(feed.websiteUrl || feedUrl)}</link>\n`;
  xml += `    <description>${escapeXml(feed.description)}</description>\n`;
  xml += `    <language>${escapeXml(feed.language)}</language>\n`;

  if (feed.copyright) {
    xml += `    <copyright>${escapeXml(feed.copyright)}</copyright>\n`;
  }

  if (feed.email) {
    xml += `    <managingEditor>${escapeXml(feed.email)} (${escapeXml(feed.author)})</managingEditor>\n`;
  }

  xml += `    <itunes:author>${escapeXml(feed.author)}</itunes:author>\n`;

  if (feed.subtitle) {
    xml += `    <itunes:subtitle>${escapeXml(feed.subtitle)}</itunes:subtitle>\n`;
  }

  if (feed.imageUrl) {
    xml += `    <itunes:image href="${escapeXml(feed.imageUrl)}"/>\n`;
    xml += `    <image>\n`;
    xml += `      <url>${escapeXml(feed.imageUrl)}</url>\n`;
    xml += `      <title>${escapeXml(feed.title)}</title>\n`;
    xml += `      <link>${escapeXml(feed.websiteUrl || feedUrl)}</link>\n`;
    xml += `    </image>\n`;
  }

  xml += `    <itunes:category text="${escapeXml(feed.categoryPrimary)}"/>\n`;
  if (feed.categorySecondary) {
    xml += `    <itunes:category text="${escapeXml(feed.categorySecondary)}"/>\n`;
  }

  xml += `    <itunes:explicit>${feed.explicit ? 'yes' : 'no'}</itunes:explicit>\n`;
  xml += `    <itunes:type>${escapeXml(feed.feedType)}</itunes:type>\n`;

  if (feed.email) {
    xml += `    <itunes:owner>\n`;
    xml += `      <itunes:name>${escapeXml(feed.author)}</itunes:name>\n`;
    xml += `      <itunes:email>${escapeXml(feed.email)}</itunes:email>\n`;
    xml += `    </itunes:owner>\n`;
  }

  for (const ep of items) {
    if (ep.status !== 'published') continue;

    xml += `    <item>\n`;
    xml += `      <title>${escapeXml(ep.title)}</title>\n`;
    xml += `      <link>${escapeXml(`${feed.baseUrl}/episodes/${ep.id}`)}</link>\n`;
    xml += `      <description>${escapeXml(ep.description)}</description>\n`;
    xml += `      <guid isPermaLink="false">${escapeXml(ep.guid)}</guid>\n`;

    if (ep.enclosureUrl) {
      xml += `      <enclosure url="${escapeXml(ep.enclosureUrl)}" length="${ep.enclosureSize ?? 0}" type="${escapeXml(ep.enclosureType)}"/>\n`;
    }

    if (ep.publishedAt) {
      const pubDate = new Date(ep.publishedAt).toUTCString();
      xml += `      <pubDate>${escapeXml(pubDate)}</pubDate>\n`;
    }

    if (ep.subtitle) {
      xml += `      <itunes:subtitle>${escapeXml(ep.subtitle)}</itunes:subtitle>\n`;
    }

    xml += `      <itunes:duration>${ep.durationSeconds != null ? getDurationFromSeconds(ep.durationSeconds) : '0:00'}</itunes:duration>\n`;
    xml += `      <itunes:explicit>${ep.explicit ? 'yes' : 'no'}</itunes:explicit>\n`;
    xml += `      <itunes:episodeType>${escapeXml(ep.episodeType)}</itunes:episodeType>\n`;

    if (ep.seasonNumber != null) {
      xml += `      <itunes:season>${ep.seasonNumber}</itunes:season>\n`;
    }
    if (ep.episodeNumber != null) {
      xml += `      <itunes:episode>${ep.episodeNumber}</itunes:episode>\n`;
    }

    if (ep.imageUrl) {
      xml += `      <itunes:image href="${escapeXml(ep.imageUrl)}"/>\n`;
    }

    xml += `      <content:encoded><![CDATA[${ep.description}]]></content:encoded>\n`;
    xml += `    </item>\n`;
  }

  xml += `  </channel>\n`;
  xml += `</rss>`;

  return xml;
}

export async function generateRssFeed(feedRaw: any): Promise<string> {
  const feed = normalizeFeed(feedRaw);
  const db = getDb();
  const rows = await db.select().from(episodes)
    .where(and(eq(episodes.feedId, feed.id), eq(episodes.status, 'published')))
    .orderBy(desc(episodes.publishedAt));
  return generateRssXml(feedRaw, rows);
}
