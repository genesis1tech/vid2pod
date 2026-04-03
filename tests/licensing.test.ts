import { describe, test, expect, vi, beforeEach } from 'vitest';
import { validateLicense } from '../src/licensing/service.js';
import { LicenseError } from '../src/shared/errors.js';

vi.mock('../src/db/client.js', () => ({
  getDb: vi.fn(),
}));

vi.mock('../src/shared/logger.js', () => ({
  createChildLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  })),
}));

describe('License validation', () => {
  test('throws for non-existent license', async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    const db = { select } as any;

    const { getDb } = await import('../src/db/client.js');
    (getDb as ReturnType<typeof vi.fn>).mockReturnValue(db);

    await expect(validateLicense('non-existent-id')).rejects.toThrow(LicenseError);
  });
});
