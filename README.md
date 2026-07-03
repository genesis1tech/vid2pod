# Vid2Pod — Turn YouTube videos into your own private podcast feed

Vid2Pod is a small, self-hosted tool that converts YouTube videos into podcast
episodes and serves them through a **private RSS feed** you subscribe to in any
podcast app. It's a personal listening tool, not a publishing platform — every
feed is private to you.

## Why I built it

I listen to a lot of YouTube while I'm doing other things — lifting at the gym,
mowing the yard, driving. The problem is that YouTube isn't built for that. If
you lock your phone or switch apps, playback stops. You have to keep the app
open and the screen on the whole time, which is useless when your phone is in
your pocket and you're pushing a mower. Background play and offline downloads
are Premium features, and I didn't want another subscription just to listen to
a video's audio.

Podcast apps already solve all of this. They play in the background, they keep
going with the screen off, they download episodes for offline listening, and
they give you lock-screen controls. So Vid2Pod takes the YouTube videos I want
to hear, turns them into clean audio episodes, and drops them into a private
podcast feed. Now the video I wanted to listen to just shows up in my podcast
app like any other episode — and it keeps playing while I mow.

## How it works

Vid2Pod runs in two pieces so the download always happens on **your own
machine, with your own browser session** — the server never touches YouTube
directly.

```
  Your machine                          Your server
  ┌────────────────────┐                ┌───────────────────────────┐
  │  Local agent        │  1. asks for  │  API (Fastify)             │
  │  (yt-dlp + your      │──pending jobs─▶│  + worker (BullMQ)        │
  │   browser cookies)   │               │                            │
  │                     │  2. uploads    │  transcode → MP3/M4A       │
  │  downloads audio ───────audio────────▶  loudness-normalize (R128) │
  └────────────────────┘               │  store in S3/MinIO         │
                                        │  build private RSS feed    │
   Podcast app  ◀───subscribe to feed───┤                            │
   (background, offline, lock-screen)   └───────────────────────────┘
```

1. You paste a YouTube URL in the web UI.
2. A **local agent** running on your computer picks up the job, downloads the
   audio with `yt-dlp` using your own browser cookies, and uploads it to the
   server.
3. The server transcodes it to MP3/M4A and applies EBU R128 loudness
   normalization so everything plays at a consistent volume.
4. The episode is added to your private, token-based RSS feed.
5. You subscribe to that feed once in your podcast app — new episodes just
   appear.

## Features

- **YouTube → podcast episode** — paste a link, get an audio episode
- **Private RSS feeds** — token-based URLs, optional HTTP Basic Auth
- **Local-agent downloads** — audio is fetched on your machine with your own
  cookies; the server only processes files you send it
- **Clean audio** — transcoding (MP3/M4A) + EBU R128 loudness normalization
- **Standards-compliant RSS** — works in Apple Podcasts, Pocket Casts, Overcast,
  and anything else that reads a feed URL
- **Auto cover art + subscribe page** — shareable subscribe link with QR code
- **Scheduling** — schedule when episodes go live
- **Self-hosted** — Docker Compose with PostgreSQL, Redis, and MinIO

## Quick Start

### 1. Run the server

```bash
# Prerequisites: Node.js 22, ffmpeg/ffprobe, Docker (for Postgres/Redis/MinIO)

git clone https://github.com/genesis1tech/vid2pod.git
cd vid2pod
npm install
cp .env.example .env          # then fill in the values (see below)

# Start infrastructure
docker compose up -d postgres redis minio

# Push the database schema
npm run db:push

# Start the API, worker, and web UI (separate terminals)
npm run dev
npm run dev:worker
npm run dev:ui
```

The app runs at `http://localhost:3000`. The MinIO console is at
`http://localhost:9001`.

Or run the whole stack with Docker:

```bash
cp .env.example .env
docker compose up
```

### 2. Run the local agent

The agent runs on your own machine and does the YouTube downloading. It needs
`yt-dlp` installed and reads cookies from your logged-in browser.

```bash
node agent/vid2pod-agent.mjs \
  --server http://localhost:3000 \
  --email you@example.com \
  --password yourpassword
```

It polls the server for pending downloads, fetches the audio locally, and
uploads the result for processing.

### Using the CLI

```bash
# Register / log in
npm run cli -- auth:register --email you@example.com --password yourpassword
npm run cli -- auth:login --email you@example.com --password yourpassword

# Create a feed
npm run cli -- feeds create \
  --title "My Podcast" --description "Stuff I want to hear" \
  --author "Me" --category Technology --token YOUR_TOKEN
```

## Configuration

Copy `.env.example` to `.env` and set at least:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | S3-compatible storage (MinIO locally) |
| `JWT_SECRET` | Secret used to sign auth tokens — set a long random value |
| `BASE_URL` | Public base URL of your server (used in feed URLs) |
| `YOUTUBE_API_KEY` | Optional — enriches episodes with YouTube metadata |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/auth/register` | No | Create account |
| POST | `/api/v1/auth/login` | No | Get JWT token |
| GET | `/api/v1/auth/me` | Yes | Current user |
| POST | `/api/v1/assets/youtube-meta` | Yes | Fetch YouTube metadata |
| POST | `/api/v1/assets/:id/process` | Yes | Trigger transcoding |
| POST | `/api/v1/feeds` | Yes | Create podcast feed |
| GET | `/api/v1/feeds` | Yes | List feeds |
| POST | `/api/v1/feeds/:feedId/episodes` | Yes | Create episode |
| POST | `/api/v1/episodes/:id/publish` | Yes | Publish episode |
| GET | `/feed/:token.xml` | Varies | Serve RSS feed |

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
npm run typecheck     # Type check
```

## Technology Stack

- **Backend:** Node.js 22 + TypeScript + Fastify 5
- **Database:** PostgreSQL 16 (Drizzle ORM)
- **Queue:** Redis 7 + BullMQ 5
- **Storage:** MinIO (S3-compatible)
- **Audio:** ffmpeg (transcoding + EBU R128 normalization), yt-dlp (local agent)
- **Frontend:** React 19 + Vite 7 + Tailwind CSS v4
- **CLI:** Commander.js

## Personal use & YouTube's Terms

Vid2Pod is a personal, self-hosted tool for shifting content **you already have
access to** into a format that's easier to listen to. Downloading content from
YouTube may conflict with the [YouTube Terms of
Service](https://www.youtube.com/t/terms), and copyright law applies to whatever
you download regardless of the tool you use to do it.

You are responsible for how you use this software and for the content you run
through it. Only use it with videos you have the right to download for personal
use, and don't use it to redistribute other people's work. This project is
provided as-is, with no warranty, and is not affiliated with YouTube or Google.

## License

MIT
