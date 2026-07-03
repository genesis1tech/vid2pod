// Creates the object-storage buckets the app needs (idempotent).
// Run standalone: `npx tsx scripts/ensure-buckets.mts`
// Or import { ensureBuckets } from it (used by scripts/setup.mts).
import { CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { existsSync } from 'node:fs';

export async function ensureBuckets(): Promise<void> {
  // Imported dynamically: src/shared/logger (pulled in via storage) calls
  // getConfig() at module load, so this must run only after .env is loaded.
  const { getS3Client } = await import('../src/publishing/storage.js');
  const { getConfig } = await import('../src/config.js');
  const config = getConfig();
  const client = getS3Client();
  const buckets = [config.S3_BUCKET, config.S3_PODCAST_BUCKET];

  for (const Bucket of buckets) {
    try {
      await client.send(new HeadBucketCommand({ Bucket }));
      console.log(`  bucket ok: ${Bucket}`);
      continue;
    } catch {
      // Not found (or not yet reachable) — try to create it below.
    }
    try {
      await client.send(new CreateBucketCommand({ Bucket }));
      console.log(`  created bucket: ${Bucket}`);
    } catch (err) {
      const name = (err as { name?: string })?.name ?? '';
      if (name.includes('BucketAlreadyOwnedByYou') || name.includes('BucketAlreadyExists')) {
        console.log(`  bucket ok: ${Bucket}`);
      } else {
        throw err;
      }
    }
  }
}

// Execute when run directly (not when imported).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  if (existsSync('.env')) process.loadEnvFile('.env');
  ensureBuckets()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Failed to ensure buckets:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
