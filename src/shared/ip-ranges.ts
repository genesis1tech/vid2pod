// Predicates for detecting non-public IP addresses, shared by the SSRF URL
// guard and the connection-pinning safe fetch.

export function isPrivateIPv4(ip: string): boolean {
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

export function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase();
  if (addr === '::1' || addr === '::') return true;          // loopback / unspecified
  if (addr.startsWith('fe80')) return true;                 // link-local
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // unique local
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

/** True if a literal IP string is any non-public address. */
export function isPrivateIp(ip: string, version: number): boolean {
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true; // unknown → unsafe
}
