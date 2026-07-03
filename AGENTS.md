# Repository Guidelines

## Project Structure & Module Organization

```
src/
  auth/           JWT auth (jose), bcrypt passwords, Bearer middleware, RBAC
  cli/            Commander.js CLI (tsx src/cli/index.ts)
  db/             Drizzle ORM schema (schema.ts), migrations, seed
  ingestion/      Audio upload (multipart, 500MB), stream URL registration, YouTube metadata
  licensing/      License CRUD with attestation validation
  processing/     BullMQ jobs, ffmpeg transcode/normalize, ffprobe metadata
  publishing/     S3 storage (MinIO), feed serving with Basic Auth
  rss/            Feed/episode CRUD, RSS XML generation (iTunes/podcast namespaces)
  shared/         Logger (pino child loggers), AppError hierarchy, constants
  web/            React 19 + Tailwind v4 frontend (separate Vite config)
  config.ts       Zod-validated env vars singleton (getConfig())
  index.ts        Fastify server entrypoint — registers all route plugins
tests/            Vitest test files (not colocated with source)
```

Database tables: `users` → `api_tokens`, `licenses` → `assets` → `episodes` → `feeds`, plus `youtube_metadata`, `processing_jobs`, `access_log`. All use UUID primary keys.

## Build, Test, and Development Commands

```bash
# One-time setup: infra + .env + schema + buckets
npm run setup

# Development — runs API + worker + UI together
npm run dev
# ...or individually:
npm run dev:api        # API server (Fastify, port 3000)
npm run dev:worker     # BullMQ processing worker
npm run dev:ui         # Frontend (Vite dev server)

# Infrastructure only
docker compose up -d postgres redis minio

# Database
npm run db:push        # Push schema to database (no migration files)
npm run db:generate    # Generate migration files
npm run db:migrate     # Run migrations
npm run db:seed        # Seed data

# Build
npm run build          # Backend (tsup → dist/)
npm run build:ui       # Frontend (Vite → src/web/dist/)

# Tests
npm test               # Run all tests (vitest)
npx vitest run tests/auth.test.ts  # Single test file

# Quality
npm run typecheck      # tsc --noEmit
npm run lint           # eslint src/
```

Prerequisites: Node.js 22, ffmpeg/ffprobe, Docker (Postgres 16, Redis 7, MinIO).

## Coding Style & Naming Conventions

- **TypeScript strict mode** with ES2024 target, NodeNext module resolution.
- **Formatting:** No Prettier configured — follow existing file style (2-space indent).
- **Imports:** Use `.js` extensions for relative imports (NodeNext requirement).
- **Errors:** Extend `AppError` from `src/shared/errors.ts` with appropriate HTTP status codes.
- **Logging:** Use `createChildLogger('module-name')` from `src/shared/logger.ts` — never use `console.log`.
- **Config:** Access env vars through `getConfig()` singleton — never read `process.env` directly.
- **Database:** Use Drizzle ORM with singleton `getDb()`. Schema defined in `src/db/schema.ts`.
- **Routes:** Fastify plugin pattern — each module exports a route registration function registered in `src/index.ts`.

## Testing Guidelines

- **Framework:** Vitest with `globals: true`.
- **Setup:** `tests/setup.ts` provides `createTestToken()` for JWT-authenticated requests.
- **Location:** All tests in `tests/` directory, named `<module>.test.ts`.
- **Run:** `npm test` (all), `npx vitest run tests/<file>.test.ts` (single).

## Commit & Pull Request Guidelines

- **Conventional commit prefixes:** `feat:`, `fix:`, `chore:` — see git history for examples.
- Commits are scoped to a single concern. Keep messages concise and descriptive.
- PRs should include a clear description of the change and its motivation.

## Architecture Notes

- **Two-process model:** API server (`src/index.ts`) and BullMQ worker (`src/processing/worker.ts`) run as separate Node processes.
- **Processing pipeline:** Ingestion enqueues → download → ffprobe metadata → transcode → EBU R128 normalize → upload to S3 → update DB.
- **Licensing (optional/internal):** A licenses table and validation exist for rights tracking. The primary YouTube flow creates assets without a license; where a license is present, expired or revoked licenses block processing. Licensing is not surfaced in the UI.
- **RSS feeds:** Private per-user, served with optional Basic Auth for podcast app compatibility.
