import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { ValidationError } from './errors.js';

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true; // malformed → treat as unsafe
  }
  const [a, b] = parts;
  if (a === 0) return true;                       // 0.0.0.0/8
  if (a === 10) return true;                      // 10.0.0.0/8
  if (a === 127) return true;                     // loopback
  if (a === 169 && b === 254) return true;        // link-local + cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true;        // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true;                      // multicast / reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase();
  if (addr === '::1' || addr === '::') return true;          // loopback / unspecified
  if (addr.startsWith('fe80')) return true;                 // link-local
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // unique local
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

/**
 * Reject URLs that are not plain http(s) to a public host, to prevent SSRF
 * against loopback, private-network, link-local, and cloud-metadata addresses.
 *
 * Call this immediately before each server-side fetch of a user-supplied URL.
 * Note: this resolves DNS at call time; there is a residual TOCTOU/rebinding
 * window between validation and the actual request, so it is validated again
 * at fetch time rather than trusting a value validated earlier.
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

  const candidates: string[] = [];
  if (isIP(host)) {
    candidates.push(host);
  } else {
    let resolved;
    try {
      resolved = await lookup(host, { all: true });
    } catch {
      throw new ValidationError('Cannot resolve URL host');
    }
    for (const r of resolved) candidates.push(r.address);
    if (candidates.length === 0) throw new ValidationError('Cannot resolve URL host');
  }

  for (const ip of candidates) {
    const version = isIP(ip);
    if (version === 4 && isPrivateIPv4(ip)) {
      throw new ValidationError('URL resolves to a non-public address');
    }
    if (version === 6 && isPrivateIPv6(ip)) {
      throw new ValidationError('URL resolves to a non-public address');
    }
  }
}
