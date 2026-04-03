import { getDb } from '../db/client.js';
import { licenses, assets, episodes } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { createChildLogger } from '../shared/logger.js';
import { LicenseError, LicenseExpiredError, LicenseRevokedError, NotFoundError } from '../shared/errors.js';
import type { LicenseType, LicenseStatus, Attestation } from '../shared/types.js';

const log = createChildLogger('license-service');

export async function createLicense(params: {
  userId: string;
  licenseType: LicenseType;
  rightsHolder?: string;
  attributionText?: string;
  validFrom?: string;
  validUntil?: string;
  notes?: string;
  attestation: Attestation;
}) {
  if (!params.attestation.agreed) {
    throw new LicenseError('Rights attestation is required');
  }

  const db = getDb();
  const id = uuid();

  const [license] = await db.insert(licenses).values({
    id,
    userId: params.userId,
    licenseType: params.licenseType,
    rightsHolder: params.rightsHolder || null,
    attributionText: params.attributionText || null,
    validFrom: params.validFrom || null,
    validUntil: params.validUntil || null,
    attestation: params.attestation,
    notes: params.notes || null,
    status: 'attested',
  }).returning();

  log.info({ licenseId: id, userId: params.userId, type: params.licenseType }, 'License created');
  return license;
}

export async function listLicenses(userId: string) {
  const db = getDb();
  return db.select().from(licenses).where(eq(licenses.userId, userId));
}

export async function getLicense(userId: string, licenseId: string) {
  const db = getDb();
  const rows = await db.select().from(licenses)
    .where(and(eq(licenses.id, licenseId), eq(licenses.userId, userId)))
    .limit(1);

  if (rows.length === 0) throw new NotFoundError('License');
  return rows[0];
}

export async function updateLicense(userId: string, licenseId: string, updates: {
  rightsHolder?: string;
  attributionText?: string;
  validFrom?: string;
  validUntil?: string;
  notes?: string;
  status?: LicenseStatus;
}) {
  const db = getDb();
  await getLicense(userId, licenseId);

  const [updated] = await db.update(licenses)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(licenses.id, licenseId))
    .returning();

  log.info({ licenseId, updates: Object.keys(updates) }, 'License updated');
  return updated;
}

export async function revokeLicense(userId: string, licenseId: string) {
  const db = getDb();

  await db.update(licenses)
    .set({ status: 'revoked', updatedAt: new Date() })
    .where(and(eq(licenses.id, licenseId), eq(licenses.userId, userId)));

  const linkedEpisodes = await db.select({ id: episodes.id })
    .from(episodes)
    .innerJoin(assets, eq(episodes.assetId, assets.id))
    .innerJoin(licenses, eq(assets.licenseId, licenses.id))
    .where(eq(licenses.id, licenseId));

  for (const ep of linkedEpisodes) {
    await db.update(episodes)
      .set({ status: 'draft', updatedAt: new Date() })
      .where(eq(episodes.id, ep.id));
  }

  log.info({ licenseId, affectedEpisodes: linkedEpisodes.length }, 'License revoked');
}

export async function validateLicense(licenseId: string): Promise<void> {
  const db = getDb();
  const rows = await db.select().from(licenses).where(eq(licenses.id, licenseId)).limit(1);
  const license = rows[0];

  if (!license) throw new LicenseError(`License ${licenseId} not found`);
  if (license.status === 'revoked') throw new LicenseRevokedError(licenseId);

  if (license.validUntil && new Date(license.validUntil) < new Date()) {
    await db.update(licenses)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(eq(licenses.id, licenseId));
    throw new LicenseExpiredError(licenseId);
  }

  if (license.status === 'expired') throw new LicenseExpiredError(licenseId);
}
