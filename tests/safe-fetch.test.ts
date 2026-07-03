import { describe, test, expect } from 'vitest';
import { safeFetch } from '../src/shared/safe-fetch.js';
import { ValidationError } from '../src/shared/errors.js';

// These assert the pre-connection guards: bad scheme, localhost, and literal
// private/loopback/metadata IPs are rejected before any socket is opened, so
// the tests need no network. (The DNS-rebinding pin via the guarded lookup is
// exercised by the ip-ranges/url-guard unit tests plus manual verification.)
describe('safeFetch pre-connection guards', () => {
  test('rejects non-http(s) schemes', async () => {
    await expect(safeFetch('file:///etc/passwd')).rejects.toBeInstanceOf(ValidationError);
    await expect(safeFetch('gopher://x/')).rejects.toBeInstanceOf(ValidationError);
  });

  test('rejects localhost', async () => {
    await expect(safeFetch('http://localhost:6379/')).rejects.toBeInstanceOf(ValidationError);
  });

  test('rejects literal loopback / private / metadata IPs', async () => {
    await expect(safeFetch('http://127.0.0.1/')).rejects.toBeInstanceOf(ValidationError);
    await expect(safeFetch('http://10.1.2.3/')).rejects.toBeInstanceOf(ValidationError);
    await expect(safeFetch('http://192.168.0.1/')).rejects.toBeInstanceOf(ValidationError);
    await expect(safeFetch('http://169.254.169.254/latest/meta-data/')).rejects.toBeInstanceOf(ValidationError);
    await expect(safeFetch('http://[::1]/')).rejects.toBeInstanceOf(ValidationError);
  });

  test('rejects malformed URLs', async () => {
    await expect(safeFetch('not a url')).rejects.toBeInstanceOf(ValidationError);
  });
});
