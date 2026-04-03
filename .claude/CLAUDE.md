# Local Development Notes

## Recent Changes

### feat: YouTube-to-podcast pipeline with local agent architecture - 2026-04-03
- Branch: `minor/youtube-podcast-pipeline`
- PR: https://github.com/genesis1tech/vid2pod/pull/1
- Summary: Full YouTube-to-podcast pipeline. Local agent downloads audio via yt-dlp with browser cookies (safe, no YouTube account risk). Server handles transcode/normalize/publish. Personal RSS feed per user with auto-generated cover art. Subscribe landing page with platform-specific deep links (Apple Podcasts, Pocket Casts). Responsive web UI with QR code. S3 storage with 7-day cleanup. Deployed to Hostinger VPS via Coolify.
