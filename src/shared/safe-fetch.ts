import { request as httpsRequest } from 'node:https';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { lookup as dnsLookup } from 'node:dns';
import { isIP, type LookupFunction } from 'node:net';
import { ValidationError } from './errors.js';
import { isPrivateIp } from './ip-ranges.js';

const MAX_REDIRECTS = 5;

export interface SafeResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}

/**
 * A DNS lookup that validates every resolved address and refuses to hand back a
 * non-public one. Passed as the `lookup` option to node's http(s) request so
 * the socket connects to exactly the address we validated — closing the
 * DNS-rebinding TOCTOU window that a validate-then-fetch approach leaves open.
 *
 * Note: node skips `lookup` entirely for literal IP hosts, so literal IPs are
 * validated separately in `assertHostAllowed` before the request is made.
 */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  const opts = typeof options === 'number' ? { family: options } : (options ?? {});
  dnsLookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return (callback as (e: NodeJS.ErrnoException | null) => void)(err);
    const list = addresses as unknown as Array<{ address: string; family: number }>;
    for (const a of list) {
      if (isPrivateIp(a.address, a.family)) {
        return (callback as (e: Error) => void)(
          new ValidationError('URL resolves to a non-public address'),
        );
      }
    }
    if ((opts as { all?: boolean }).all) {
      return (callback as unknown as (e: null, a: typeof list) => void)(null, list);
    }
    return callback(null, list[0].address, list[0].family);
  });
};

function assertHostAllowed(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError('Only http and https URLs are allowed');
  }
  const host = url.hostname;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new ValidationError('URL host is not allowed');
  }
  // Literal IPs bypass the guarded lookup, so validate them here.
  // URL.hostname keeps brackets around IPv6 literals (e.g. "[::1]"); strip them.
  const literal = host.replace(/^\[/, '').replace(/\]$/, '');
  const version = isIP(literal);
  if (version !== 0 && isPrivateIp(literal, version)) {
    throw new ValidationError('URL host is not allowed');
  }
}

function requestOnce(url: URL, method: string): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const requestFn = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = requestFn(url, { method, lookup: guardedLookup }, resolve);
    req.on('error', reject);
    req.end();
  });
}

function readBody(res: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => resolve(Buffer.concat(chunks)));
    res.on('error', reject);
  });
}

/**
 * SSRF-safe replacement for `fetch` for user-supplied URLs. Only follows http(s),
 * validates the host (including every redirect hop), and pins each connection to
 * a validated public address. Supports the subset of the fetch API this codebase
 * needs: `ok`, `status`, `headers.get()`, and `arrayBuffer()`.
 */
export async function safeFetch(rawUrl: string, init: { method?: string } = {}): Promise<SafeResponse> {
  const method = init.method ?? 'GET';
  let currentUrl = rawUrl;

  for (let redirects = 0; ; redirects++) {
    let url: URL;
    try {
      url = new URL(currentUrl);
    } catch {
      throw new ValidationError('Invalid URL');
    }
    assertHostAllowed(url);

    const res = await requestOnce(url, method);
    const status = res.statusCode ?? 0;

    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume(); // drain and free the socket
      if (redirects >= MAX_REDIRECTS) throw new ValidationError('Too many redirects');
      currentUrl = new URL(res.headers.location, url).toString();
      continue;
    }

    let body: Buffer = Buffer.alloc(0);
    if (method !== 'HEAD') {
      body = await readBody(res);
    } else {
      res.resume();
    }

    const headers = res.headers;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get(name: string): string | null {
          const v = headers[name.toLowerCase()];
          return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
        },
      },
      arrayBuffer: async () => {
        const copy = new Uint8Array(body.byteLength);
        copy.set(body);
        return copy.buffer;
      },
    };
  }
}
