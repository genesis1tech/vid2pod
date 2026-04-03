export const PODCAST_CATEGORIES = [
  'Arts', 'Business', 'Comedy', 'Education', 'Fiction',
  'Government', 'History', 'Health & Fitness', 'Kids & Family',
  'Leisure', 'Music', 'News', 'Religion & Spirituality', 'Science',
  'Society & Culture', 'Sports', 'Technology', 'True Crime', 'TV & Film',
] as const;

export const ACCEPTED_AUDIO_TYPES = [
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a',
  'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/flac',
  'audio/ogg', 'audio/opus', 'audio/aac',
] as const;

export const ACCEPTED_EXTENSIONS = [
  '.mp3', '.m4a', '.wav', '.flac', '.ogg', '.opus', '.aac',
] as const;

export const MAX_UPLOAD_SIZE = 500 * 1024 * 1024; // 500MB

export const DEFAULT_ENCLOSURE_TYPE = 'audio/mpeg';

export const ITUNES_NAMESPACE = 'http://www.itunes.com/dtds/podcast-1.0.dtd';
export const CONTENT_NAMESPACE = 'http://purl.org/rss/1.0/modules/content/';
export const PODCAST_NAMESPACE = 'https://podcastindex.org/namespace/1.0';
