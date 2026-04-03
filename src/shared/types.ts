export type UserRole = 'admin' | 'editor' | 'viewer';

export type LicenseType =
  | 'owned_original'
  | 'owned_license'
  | 'creative_commons'
  | 'public_domain'
  | 'sync_license'
  | 'mechanical_license'
  | 'other';

export type LicenseStatus = 'attested' | 'verified' | 'expired' | 'revoked';

export type AssetSourceType = 'audio_upload' | 'stream_url' | 'licensed_file';

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type FeedVisibility = 'public' | 'unlisted' | 'private';

export type FeedAuthType = 'none' | 'basic_auth' | 'token';

export type FeedType = 'episodic' | 'serial';

export type EpisodeType = 'full' | 'trailer' | 'bonus';

export type EpisodeStatus = 'draft' | 'scheduled' | 'published' | 'retired';

export type JobType = 'transcode' | 'normalize' | 'metadata' | 'artwork';

export interface Attestation {
  agreed: true;
  date: string;
  ip?: string;
  statement: string;
}

export interface AudioMetadata {
  duration?: number;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  codec?: string;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
