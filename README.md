# Vid2Pod — Personal Podcast RSS Feed Generator

A self-hosted, compliance-first podcast feed generator. Build private or public podcast RSS feeds from audio assets you **own or have licensed rights to**.

> **Core principle:** No content is processed unless you have explicitly attested to having rights. Every asset is linked to a license record before processing begins.

## Features

- **Rights-first architecture** — License attestation required before any asset processing
- **YouTube Data API** — Fetches video metadata and thumbnails only (never downloads audio)
- **Audio processing** — Transcoding (MP3/AAC), EBU R128 loudness normalization via ffmpeg
- **Standards-compliant RSS** — Apple Podcasts & Spotify compatible with full iTunes namespace
- **Private feeds** — Token-based URLs, HTTP Basic Auth support for premium content
- **Scheduling** — Schedule episode releases with automatic publishing
- **Web UI + CLI** — Manage everything from the browser or terminal
- **Self-hosted** — Docker Compose with PostgreSQL, Redis, and MinIO

## Quick Start

### With Docker (Recommended)

```bash
cp .env.example .env
# Edit .env — add your YouTube Data API key (optional)

docker compose up
```

The app runs at `http://localhost:3000`. MinIO console at `http://localhost:9001`.

### Manual Setup

```bash
# Prerequisites: Node.js 22, ffmpeg, Docker (for Postgres/Redis/MinIO)

npm install
cp .env.example .env

# Start infrastructure
docker compose up -d postgres redis minio

# Push database schema
npm run db:push

# Start API server
npm run dev

# Start worker (separate terminal)
npm run dev:worker

# Start frontend (separate terminal)
npm run dev:ui
```

### Using the CLI

```bash
# Register
npx tsx src/cli/index.ts auth:register --email you@example.com --password yourpassword

# Login
npx tsx src/cli/index.ts auth:login --email you@example.com --password yourpassword

# Create a license
npx tsx src/cli/index.ts licenses create --type owned_original --holder "Your Name" --token YOUR_TOKEN

# Create a feed
npx tsx src/cli/index.ts feeds create --title "My Podcast" --description "Desc" --author "Me" --category Technology --token YOUR_TOKEN
```

## Architecture

```
┌──────────┐  ┌──────────┐  ┌──────────┐
│  Web UI   │  │   CLI    │  │ REST API │
│  React    │  │Commander │  │ Fastify  │
└─────┬─────┘  └────┬─────┘  └────┬─────┘
      └──────────────┼─────────────┘
                     ▼
  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ Licensing │ │Ingestion │ │Processing│ │RSS Gen   │
  │ Attest   │ │Upload    │ │Transcode │ │XML+iTunes│
  │ Validate │ │YouTube   │ │Normalize │ │Publish   │
  └──────────┘ └──────────┘ └──────────┘ └──────────┘
         └──────────┬──────────┘
                    ▼
  PostgreSQL │ Redis/BullMQ │ MinIO/S3
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/auth/register` | No | Create account |
| POST | `/api/v1/auth/login` | No | Get JWT token |
| GET | `/api/v1/auth/me` | Yes | Current user |
| POST | `/api/v1/licenses` | Yes | Create license with attestation |
| GET | `/api/v1/licenses` | Yes | List licenses |
| PATCH | `/api/v1/licenses/:id/revoke` | Yes | Revoke license |
| POST | `/api/v1/assets/upload` | Yes | Upload audio (requires license_id) |
| POST | `/api/v1/assets/stream-url` | Yes | Register stream URL |
| POST | `/api/v1/assets/youtube-meta` | Yes | Fetch YouTube metadata only |
| POST | `/api/v1/assets/:id/process` | Yes | Trigger transcoding |
| POST | `/api/v1/feeds` | Yes | Create podcast feed |
| GET | `/api/v1/feeds` | Yes | List feeds |
| POST | `/api/v1/feeds/:feedId/episodes` | Yes | Create episode |
| POST | `/api/v1/episodes/:id/publish` | Yes | Publish episode |
| GET | `/feed/:token.xml` | Varies | Serve RSS feed |

## YouTube API Compliance

This application uses the YouTube Data API v3 **only** for:

- Fetching video metadata (title, description, tags)
- Retrieving thumbnails via official API endpoints

It does **NOT**:

- Download, rip, or extract audio from YouTube videos
- Bypass any access controls or restrictions
- Store any YouTube audio/video content

A valid YouTube Data API key is required for YouTube metadata features. Get one at [Google Cloud Console](https://console.cloud.google.com/).

## Legal Compliance

Every asset in Vid2Pod requires:

1. **Rights attestation** — You must explicitly confirm you have rights to the content
2. **License documentation** — Type, rights holder, validity period recorded
3. **Audit trail** — Every asset → license → episode link is logged

Content that **cannot** be used:

- Content you don't own or have a license for
- Audio downloaded/ripped from YouTube, Spotify, or other platforms
- Expired or revoked licenses (episodes automatically revert to draft)
- Creative Commons content where the specific license prohibits your intended use

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
```

## Technology Stack

- **Backend:** Node.js 22 + TypeScript + Fastify 5
- **Database:** PostgreSQL 16 (Drizzle ORM)
- **Queue:** Redis 7 + BullMQ 5
- **Storage:** MinIO (S3-compatible)
- **Audio:** ffmpeg (transcoding + EBU R128 normalization)
- **Frontend:** React 19 + Vite 7 + Tailwind CSS v4
- **CLI:** Commander.js

## License

MIT
