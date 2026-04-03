import { Command } from 'commander';
import { getConfig } from '../config.js';
import { createChildLogger } from '../shared/logger.js';

const log = createChildLogger('cli');

const program = new Command();
program
  .name('vid2pod')
  .description('Personal podcast RSS feed generator')
  .version('0.1.0');

let API_BASE = 'http://localhost:3000';
let AUTH_TOKEN = '';

async function api(path: string, options?: RequestInit): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };
  if (AUTH_TOKEN) headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body: any = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(body.message || body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

program
  .command('auth:login')
  .description('Login and save credentials')
  .requiredOption('--email <email>', 'Email')
  .requiredOption('--password <password>', 'Password')
  .option('--api-url <url>', 'API base URL', 'http://localhost:3000')
  .action(async (opts) => {
    API_BASE = opts.apiUrl;
    const res = await api('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: opts.email, password: opts.password }),
    });
    AUTH_TOKEN = res.accessToken;
    console.log(`Logged in as ${res.user.email}`);
    console.log(`Token: ${res.accessToken}`);
  });

program
  .command('auth:register')
  .description('Register a new account')
  .requiredOption('--email <email>', 'Email')
  .requiredOption('--password <password>', 'Password')
  .option('--name <name>', 'Display name')
  .option('--api-url <url>', 'API base URL', 'http://localhost:3000')
  .action(async (opts) => {
    API_BASE = opts.apiUrl;
    const res = await api('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: opts.email, password: opts.password, displayName: opts.name }),
    });
    console.log(`Registered as ${res.user.email}`);
    console.log(`Token: ${res.accessToken}`);
  });

const licensesCmd = program.command('licenses').description('Manage licenses');

licensesCmd
  .command('create')
  .description('Create a license with rights attestation')
  .requiredOption('--type <type>', 'License type')
  .requiredOption('--token <token>', 'Auth token')
  .option('--holder <holder>', 'Rights holder')
  .option('--attribution <text>', 'Attribution text')
  .option('--valid-until <date>', 'Valid until date')
  .option('--api-url <url>', 'API base URL', 'http://localhost:3000')
  .action(async (opts) => {
    API_BASE = opts.apiUrl;
    AUTH_TOKEN = opts.token;
    const lic = await api('/api/v1/licenses', {
      method: 'POST',
      body: JSON.stringify({
        licenseType: opts.type,
        rightsHolder: opts.holder,
        attributionText: opts.attribution,
        validUntil: opts.validUntil,
        attestation: {
          agreed: true,
          date: new Date().toISOString(),
          statement: `I attest I have rights under: ${opts.type}`,
        },
      }),
    });
    console.log(JSON.stringify(lic, null, 2));
  });

licensesCmd
  .command('list')
  .description('List licenses')
  .requiredOption('--token <token>', 'Auth token')
  .option('--api-url <url>', 'API base URL', 'http://localhost:3000')
  .action(async (opts) => {
    API_BASE = opts.apiUrl;
    AUTH_TOKEN = opts.token;
    const list = await api('/api/v1/licenses');
    console.log(JSON.stringify(list, null, 2));
  });

const feedsCmd = program.command('feeds').description('Manage podcast feeds');

feedsCmd
  .command('create')
  .description('Create a podcast feed')
  .requiredOption('--title <title>', 'Feed title')
  .requiredOption('--description <desc>', 'Feed description')
  .requiredOption('--author <author>', 'Author name')
  .requiredOption('--category <category>', 'Primary category')
  .requiredOption('--token <token>', 'Auth token')
  .option('--email <email>', 'Contact email')
  .option('--visibility <vis>', 'public/unlisted/private', 'private')
  .option('--api-url <url>', 'API base URL', 'http://localhost:3000')
  .action(async (opts) => {
    API_BASE = opts.apiUrl;
    AUTH_TOKEN = opts.token;
    const feed = await api('/api/v1/feeds', {
      method: 'POST',
      body: JSON.stringify({
        title: opts.title,
        description: opts.description,
        author: opts.author,
        categoryPrimary: opts.category,
        email: opts.email,
        visibility: opts.visibility,
      }),
    });
    console.log(JSON.stringify(feed, null, 2));
  });

feedsCmd
  .command('list')
  .description('List feeds')
  .requiredOption('--token <token>', 'Auth token')
  .option('--api-url <url>', 'API base URL', 'http://localhost:3000')
  .action(async (opts) => {
    API_BASE = opts.apiUrl;
    AUTH_TOKEN = opts.token;
    const list = await api('/api/v1/feeds');
    console.log(JSON.stringify(list, null, 2));
  });

const episodesCmd = program.command('episodes').description('Manage episodes');

episodesCmd
  .command('create')
  .description('Create an episode')
  .requiredOption('--feed <feedId>', 'Feed ID')
  .requiredOption('--title <title>', 'Episode title')
  .requiredOption('--description <desc>', 'Episode description')
  .requiredOption('--token <token>', 'Auth token')
  .option('--asset <assetId>', 'Asset ID')
  .option('--season <num>', 'Season number')
  .option('--episode <num>', 'Episode number')
  .option('--api-url <url>', 'API base URL', 'http://localhost:3000')
  .action(async (opts) => {
    API_BASE = opts.apiUrl;
    AUTH_TOKEN = opts.token;
    const ep = await api(`/api/v1/feeds/${opts.feed}/episodes`, {
      method: 'POST',
      body: JSON.stringify({
        title: opts.title,
        description: opts.description,
        assetId: opts.asset,
        seasonNumber: opts.season ? parseInt(opts.season) : undefined,
        episodeNumber: opts.episode ? parseInt(opts.episode) : undefined,
      }),
    });
    console.log(JSON.stringify(ep, null, 2));
  });

episodesCmd
  .command('publish')
  .description('Publish an episode')
  .requiredOption('--id <episodeId>', 'Episode ID')
  .requiredOption('--token <token>', 'Auth token')
  .option('--api-url <url>', 'API base URL', 'http://localhost:3000')
  .action(async (opts) => {
    API_BASE = opts.apiUrl;
    AUTH_TOKEN = opts.token;
    const ep = await api(`/api/v1/episodes/${opts.id}/publish`, { method: 'POST' });
    console.log(JSON.stringify(ep, null, 2));
  });

const assetsCmd = program.command('assets').description('Manage assets');

assetsCmd
  .command('list')
  .description('List assets')
  .requiredOption('--token <token>', 'Auth token')
  .option('--api-url <url>', 'API base URL', 'http://localhost:3000')
  .action(async (opts) => {
    API_BASE = opts.apiUrl;
    AUTH_TOKEN = opts.token;
    const list = await api('/api/v1/assets');
    console.log(JSON.stringify(list, null, 2));
  });

assetsCmd
  .command('process')
  .description('Trigger asset processing')
  .requiredOption('--id <assetId>', 'Asset ID')
  .requiredOption('--token <token>', 'Auth token')
  .option('--api-url <url>', 'API base URL', 'http://localhost:3000')
  .action(async (opts) => {
    API_BASE = opts.apiUrl;
    AUTH_TOKEN = opts.token;
    const job = await api(`/api/v1/assets/${opts.id}/process`, { method: 'POST' });
    console.log(JSON.stringify(job, null, 2));
  });

program.parse();
