import {
  pgTable, uuid, text, boolean, integer, bigint, timestamp, date, jsonb,
  index,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  displayName: text('display_name'),
  role: text('role', { enum: ['admin', 'editor', 'viewer'] }).notNull().default('editor'),
  agentLastSeen: timestamp('agent_last_seen', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const apiTokens = pgTable('api_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  tokenPrefix: text('token_prefix').notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('api_tokens_user_id_idx').on(table.userId),
]);

export const licenses = pgTable('licenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  licenseType: text('license_type', {
    enum: ['owned_original', 'owned_license', 'creative_commons', 'public_domain', 'sync_license', 'mechanical_license', 'other'],
  }).notNull(),
  rightsHolder: text('rights_holder'),
  licenseDocumentUrl: text('license_document_url'),
  attributionText: text('attribution_text'),
  validFrom: date('valid_from'),
  validUntil: date('valid_until'),
  attestation: jsonb('attestation').notNull().$type<{ agreed: true; date: string; ip?: string; statement: string }>(),
  status: text('status', {
    enum: ['attested', 'verified', 'expired', 'revoked'],
  }).notNull().default('attested'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('licenses_user_id_idx').on(table.userId),
]);

export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  licenseId: uuid('license_id').references(() => licenses.id),
  sourceType: text('source_type', {
    enum: ['audio_upload', 'stream_url', 'licensed_file'],
  }).notNull(),
  originalFilename: text('original_filename'),
  storageKey: text('storage_key'),
  streamUrl: text('stream_url'),
  mimeType: text('mime_type'),
  fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }),
  youtubeVideoId: text('youtube_video_id'),
  checksumSha256: text('checksum_sha256'),
  metadata: jsonb('metadata').$type<{ duration?: number; bitrate?: number; sampleRate?: number; channels?: number; codec?: string }>(),
  processingStatus: text('processing_status', {
    enum: ['pending_download', 'pending', 'processing', 'completed', 'failed'],
  }).notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('assets_user_id_idx').on(table.userId),
  index('assets_license_id_idx').on(table.licenseId),
  index('assets_processing_status_idx').on(table.processingStatus),
  index('assets_youtube_video_id_idx').on(table.youtubeVideoId),
]);

export const youtubeMetadata = pgTable('youtube_metadata', {
  id: uuid('id').primaryKey().defaultRandom(),
  assetId: uuid('asset_id').references(() => assets.id),
  videoId: text('video_id').notNull().unique(),
  title: text('title'),
  description: text('description'),
  channelTitle: text('channel_title'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  thumbnailUrl: text('thumbnail_url'),
  durationIso: text('duration_iso'),
  tags: jsonb('tags').$type<string[]>(),
  categoryId: text('category_id'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  rawResponse: jsonb('raw_response'),
}, (table) => [
  index('youtube_metadata_asset_id_idx').on(table.assetId),
]);

export const feeds = pgTable('feeds', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  description: text('description').notNull(),
  author: text('author').notNull(),
  email: text('email'),
  websiteUrl: text('website_url'),
  language: text('language').notNull().default('en'),
  copyright: text('copyright'),
  imageStorageKey: text('image_storage_key'),
  imageUrl: text('image_url'),
  categoryPrimary: text('category_primary').notNull(),
  categorySecondary: text('category_secondary'),
  explicit: boolean('explicit').notNull().default(false),
  feedType: text('feed_type', { enum: ['episodic', 'serial'] }).notNull().default('episodic'),
  ownershipToken: text('ownership_token').notNull().unique(),
  visibility: text('visibility', {
    enum: ['public', 'unlisted', 'private'],
  }).notNull().default('private'),
  authType: text('auth_type', { enum: ['none', 'basic_auth', 'token'] }),
  authUsername: text('auth_username'),
  authPasswordHash: text('auth_password_hash'),
  baseUrl: text('base_url').notNull(),
  lastPublishedAt: timestamp('last_published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('feeds_user_id_idx').on(table.userId),
]);

export const episodes = pgTable('episodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  feedId: uuid('feed_id').notNull().references(() => feeds.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id').references(() => assets.id),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  description: text('description').notNull(),
  seasonNumber: integer('season_number'),
  episodeNumber: integer('episode_number'),
  episodeType: text('episode_type', { enum: ['full', 'trailer', 'bonus'] }).notNull().default('full'),
  enclosureUrl: text('enclosure_url'),
  enclosureSize: bigint('enclosure_size', { mode: 'number' }),
  enclosureType: text('enclosure_type').notNull().default('audio/mpeg'),
  durationSeconds: integer('duration_seconds'),
  imageStorageKey: text('image_storage_key'),
  imageUrl: text('image_url'),
  explicit: boolean('explicit').notNull().default(false),
  guid: text('guid').notNull().unique(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  status: text('status', {
    enum: ['draft', 'scheduled', 'publishing', 'published', 'retired'],
  }).notNull().default('draft'),
  sortOrder: integer('sort_order').notNull().default(0),
  firstDownloadedAt: timestamp('first_downloaded_at', { withTimezone: true }),
  storageExpiry: timestamp('storage_expiry', { withTimezone: true }),
  storageCleared: boolean('storage_cleared').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('episodes_feed_id_idx').on(table.feedId),
  index('episodes_asset_id_idx').on(table.assetId),
  index('episodes_status_idx').on(table.status),
  index('episodes_storage_cleanup_idx').on(table.storageCleared, table.storageExpiry),
]);

export const accessLog = pgTable('access_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  feedId: uuid('feed_id').notNull().references(() => feeds.id),
  episodeId: uuid('episode_id').references(() => episodes.id),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  accessedAt: timestamp('accessed_at', { withTimezone: true }).notNull().defaultNow(),
  authMethod: text('auth_method'),
}, (table) => [
  index('access_log_feed_id_idx').on(table.feedId),
  index('access_log_episode_id_idx').on(table.episodeId),
  index('access_log_accessed_at_idx').on(table.accessedAt),
]);

export const processingJobs = pgTable('processing_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  assetId: uuid('asset_id').notNull().references(() => assets.id),
  jobType: text('job_type', { enum: ['transcode', 'normalize', 'metadata', 'artwork'] }).notNull(),
  status: text('status').notNull().default('queued'),
  bullmqJobId: text('bullmq_job_id'),
  inputKey: text('input_key'),
  outputKey: text('output_key'),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('processing_jobs_asset_id_idx').on(table.assetId),
  index('processing_jobs_status_idx').on(table.status),
]);
