# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vid2Pod — a self-hosted personal podcast library. Find helpful YouTube videos, convert them to podcast episodes, and listen in any podcast app via private RSS feeds. All feeds are private to the user — this is a personal consumption tool, not a publishing platform.

## Commands

```bash
# Development — run these in separate terminals
npm run dev           # API server (Fastify, port 3000)
npm run dev:worker    # BullMQ processing worker
npm run dev:ui        # Frontend (Vite dev server)

# Infrastructure (Postgres, Redis, MinIO)
docker compose up -d postgres redis minio

# Database
npm run db:push       # Push schema to database (no migration files)
npm run db:generate   # Generate migration files
npm run db:migrate    # Run migrations
npm run db:seed       # Seed data

# Build
npm run build         # Backend (tsup → dist/)
npm run build:ui      # Frontend (Vite → src/web/dist/)

# Tests
npm test              # Run all tests (vitest)
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
npx vitest run tests/auth.test.ts  # Single test file

# Quality
npm run typecheck     # tsc --noEmit
npm run lint          # eslint src/

# CLI
npm run cli -- <command>  # e.g., npm run cli -- auth:register --email x --password y
```

**Prerequisites:** Node.js 22, ffmpeg/ffprobe, Docker (for Postgres 16, Redis 7, MinIO).

## Architecture

### Two-Process Model

The app runs as two separate Node processes:
1. **API Server** (`src/index.ts`) — Fastify HTTP server with REST API, RSS feed serving, and a 60s interval scheduler for auto-publishing scheduled episodes
2. **Worker** (`src/processing/worker.ts`) — BullMQ worker consuming the `vid2pod-processing` queue with concurrency of 2

### Processing Pipeline

`ingestion/service.ts` → enqueues job → `processing/jobs.ts::processAsset()`:
1. Download from S3 or fetch stream URL to temp dir
2. Extract metadata via ffprobe (`processing/metadata-extractor.ts`)
3. Transcode to MP3/M4A (`processing/transcoder.ts` via fluent-ffmpeg)
4. EBU R128 loudness normalize (`processing/normalizer.ts`)
5. Upload processed file to S3 under `processed/{userId}/{assetId}/`
6. Update asset status in Postgres

### Module Structure

| Module | Purpose |
|--------|---------|
| `auth/` | JWT auth (jose), bcrypt passwords, Bearer middleware, role-based access |
| `licensing/` | License CRUD with attestation validation — every asset requires a valid license |
| `ingestion/` | Audio upload (multipart, 500MB limit), stream URL registration, YouTube metadata fetch |
| `processing/` | BullMQ jobs, ffmpeg transcode/normalize, ffprobe metadata extraction |
| `rss/` | Feed/episode CRUD, RSS XML generation with iTunes/podcast namespaces, scheduled publishing |
| `publishing/` | S3 storage (MinIO), feed serving with Basic Auth support, access logging |
| `cli/` | Commander.js CLI for auth, feeds, licenses |
| `web/` | React 19 + Tailwind v4 frontend (separate Vite config at `src/web/vite.config.ts`) |
| `shared/` | Logger (pino), error classes (`AppError` hierarchy), constants, shared types |

### Key Patterns

- **Config:** Zod-validated env vars via `getConfig()` singleton (`src/config.ts`)
- **Database:** Drizzle ORM with `pg` driver. Singleton via `getDb()`. Schema in `src/db/schema.ts`
- **Storage:** S3-compatible (MinIO locally) via `@aws-sdk/client-s3`. Singleton client via `getS3Client()`
- **Errors:** Custom `AppError` subclasses with HTTP status codes — caught by Fastify error handler in `src/index.ts`
- **Logging:** pino with child loggers per module (`createChildLogger('module-name')`)
- **Auth:** JWT access tokens (15m default), verified in `authMiddleware`. User info injected into `FastifyRequest` via module augmentation
- **Routes:** Fastify plugin pattern — each module exports a route registration function registered in `src/index.ts`

### Database Tables

`users` → `licenses` → `assets` → `episodes` → `feeds`, plus `youtube_metadata`, `processing_jobs`, `access_log`. All use UUID primary keys.

### Rights-First Constraint

Every asset must reference a valid license (`license_id`). License validation runs before processing. Expired/revoked licenses block processing.

## Test Setup

Tests use vitest with `globals: true` and a setup file at `tests/setup.ts` that provides `createTestToken()` for JWT-authenticated test requests. Test files are in `tests/` (not colocated with source).

## Environment

Copy `.env.example` to `.env`. Key variables: `DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `JWT_SECRET`, `YOUTUBE_API_KEY` (optional), `FFMPEG_PATH`, `FFPROBE_PATH`.
