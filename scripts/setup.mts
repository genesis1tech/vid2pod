// One-command dev setup: infra + .env + schema + buckets.
// Run: `npm run setup`  (then `npm run dev`)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { ensureBuckets } from './ensure-buckets.mjs';

const INFRA_SERVICES = ['postgres', 'redis', 'minio'];

function step(msg: string): void {
  console.log(`\n▶ ${msg}`);
}

function run(cmd: string, args: string[]): void {
  execFileSync(cmd, args, { stdio: 'inherit' });
}

function ensureEnv(): void {
  step('Checking .env');
  if (existsSync('.env')) {
    console.log('  .env already exists — leaving it untouched');
    return;
  }
  if (!existsSync('.env.example')) {
    throw new Error('.env.example not found — cannot create .env');
  }
  let contents = readFileSync('.env.example', 'utf8');
  // Generate a strong JWT secret so the app is not left on the placeholder.
  const secret = randomBytes(48).toString('base64url');
  contents = contents.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`);
  writeFileSync('.env', contents);
  console.log('  created .env from .env.example (with a generated JWT_SECRET)');
}

function checkDocker(): void {
  step('Checking Docker');
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore' });
    console.log('  Docker is running');
  } catch {
    throw new Error('Docker does not appear to be running. Start Docker Desktop and re-run `npm run setup`.');
  }
}

function startInfra(): void {
  step(`Starting infrastructure (${INFRA_SERVICES.join(', ')})`);
  run('docker', ['compose', 'up', '-d', ...INFRA_SERVICES]);
}

async function waitForPostgres(): Promise<void> {
  step('Waiting for Postgres');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (check your .env)');
  const deadline = Date.now() + 60_000;
  for (;;) {
    const client = new pg.Client({ connectionString: url });
    try {
      await client.connect();
      await client.query('select 1');
      await client.end();
      console.log('  Postgres is ready');
      return;
    } catch {
      await client.end().catch(() => {});
      if (Date.now() > deadline) throw new Error('Postgres did not become ready within 60s');
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

function pushSchema(): void {
  step('Creating database schema (drizzle-kit push)');
  // --force auto-confirms; on a fresh dev DB every change is an additive create.
  run('npx', ['drizzle-kit', 'push', '--force']);
}

async function makeBuckets(): Promise<void> {
  step('Ensuring object-storage buckets');
  // MinIO may take a moment after the container reports up; retry briefly.
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      await ensureBuckets();
      return;
    } catch (err) {
      if (Date.now() > deadline) throw err;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

async function main(): Promise<void> {
  ensureEnv();
  // Load the freshly-created (or existing) .env so later steps see the config.
  process.loadEnvFile('.env');

  checkDocker();
  startInfra();
  await waitForPostgres();
  pushSchema();
  await makeBuckets();

  console.log('\n✅ Setup complete.\n');
  console.log('Next steps:');
  console.log('  npm run dev     # start API + worker + UI together');
  console.log('  then run the local agent for YouTube downloads:');
  console.log('  node agent/vid2pod-agent.mjs --server http://localhost:3000 --email you@example.com --password yourpass\n');
}

main().catch((err) => {
  console.error(`\n✗ Setup failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
