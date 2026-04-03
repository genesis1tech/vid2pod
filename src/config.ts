import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().default('postgresql://vid2pod:vid2pod@localhost:5432/vid2pod'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin'),
  S3_BUCKET: z.string().default('vid2pod-media'),
  S3_PODCAST_BUCKET: z.string().default('vid2pod-podcasts'),
  S3_REGION: z.string().default('us-east-1'),
  JWT_SECRET: z.string().default('dev-secret-change-me'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  YOUTUBE_API_KEY: z.string().default(''),
  PORT: z.coerce.number().default(3000),
  BASE_URL: z.string().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DEFAULT_BITRATE: z.coerce.number().default(128000),
  DEFAULT_TARGET_LUFS: z.coerce.number().default(-16),
  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),
  YT_DLP_PATH: z.string().default('yt-dlp'),
  POLL_INTERVAL_MS: z.coerce.number().default(60_000), // 1 minute
});

export type Env = z.infer<typeof envSchema>;

let _config: Env | null = null;

export function getConfig(): Env {
  if (!_config) {
    _config = envSchema.parse(process.env);
  }
  return _config;
}
