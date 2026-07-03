import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { ValidationError } from './errors.js';
import { isPrivateIp } from './ip-ranges.js';

/**
 * Reject URLs that are not plain http(s) to a public host, to prevent SSRF
 * against loopback, private-network, link-local, and cloud-metadata addresses.
 *
 * This is an upfront best-effort check. For the actual server-side request use
 * `safeFetch`, which additionally pins the connection to a validated address so
 * a DNS name cannot rebind to a private address between validation and connect.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ValidationError('Invalid URL');
  }

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

  const candidates: Array<{ address: string; version: number }> = [];
  if (isIP(host)) {
    candidates.push({ address: host, version: isIP(host) });
  } else {
    let resolved;
    try {
      resolved = await lookup(host, { all: true });
    } catch {
      throw new ValidationError('Cannot resolve URL host');
    }
    for (const r of resolved) candidates.push({ address: r.address, version: isIP(r.address) });
    if (candidates.length === 0) throw new ValidationError('Cannot resolve URL host');
  }

  for (const c of candidates) {
    if (isPrivateIp(c.address, c.version)) {
      throw new ValidationError('URL resolves to a non-public address');
    }
  }
}
