import { basename } from 'path';

/**
 * Produce a filesystem- and object-key-safe filename from untrusted input.
 *
 * Strips any directory component (defeats `../` traversal and absolute paths)
 * and reduces the result to a conservative character set, so the value can be
 * safely used both in `path.join()` for local temp files and in S3 object keys.
 */
export function sanitizeFilename(name: string | null | undefined, fallback = 'upload'): string {
  if (!name) return fallback;
  // basename removes POSIX directory components; the replace neutralizes any
  // remaining separators (e.g. backslashes) and other unusual characters.
  const safe = basename(name)
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/^\.+/, ''); // never allow a leading-dot-only / dotfile-escape name
  return safe || fallback;
}
