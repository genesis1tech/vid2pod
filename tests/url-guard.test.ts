import { describe, test, expect } from 'vitest';
import { assertPublicHttpUrl } from '../src/shared/url-guard.js';
import { ValidationError } from '../src/shared/errors.js';

// These cases use literal IPs and reserved hostnames so no real DNS lookup is
// performed, keeping the tests deterministic and offline.
describe('assertPublicHttpUrl (SSRF guard)', () => {
  test('rejects non-http(s) schemes', async () => {
    await expect(assertPublicHttpUrl('file:///etc/passwd')).rejects.toBeInstanceOf(ValidationError);
    await expect(assertPublicHttpUrl('gopher://x')).rejects.toBeInstanceOf(ValidationError);
    await expect(assertPublicHttpUrl('ftp://example.com')).rejects.toBeInstanceOf(ValidationError);
  });

  test('rejects loopback and localhost', async () => {
    await expect(assertPublicHttpUrl('http://127.0.0.1/')).rejects.toBeInstanceOf(ValidationError);
    await expect(assertPublicHttpUrl('http://localhost:6379')).rejects.toBeInstanceOf(ValidationError);
    await expect(assertPublicHttpUrl('http://[::1]/')).rejects.toBeInstanceOf(ValidationError);
  });

  test('rejects private ranges', async () => {
    await expect(assertPublicHttpUrl('http://10.0.0.5/')).rejects.toBeInstanceOf(ValidationError);
    await expect(assertPublicHttpUrl('http://172.16.4.4/')).rejects.toBeInstanceOf(ValidationError);
    await expect(assertPublicHttpUrl('http://192.168.1.1/')).rejects.toBeInstanceOf(ValidationError);
  });

  test('rejects cloud metadata and link-local', async () => {
    await expect(assertPublicHttpUrl('http://169.254.169.254/latest/meta-data/')).rejects.toBeInstanceOf(ValidationError);
  });

  test('rejects malformed URLs', async () => {
    await expect(assertPublicHttpUrl('not a url')).rejects.toBeInstanceOf(ValidationError);
  });

  test('allows a public literal IP', async () => {
    await expect(assertPublicHttpUrl('https://8.8.8.8/')).resolves.toBeUndefined();
  });
});
