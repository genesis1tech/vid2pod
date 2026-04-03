import { FastifyInstance } from 'fastify';
import { createLicense, listLicenses, getLicense, updateLicense, revokeLicense } from './service.js';
import { authMiddleware } from '../auth/middleware.js';
import { z } from 'zod';

const attestationSchema = z.object({
  agreed: z.literal(true),
  date: z.string(),
  ip: z.string().optional(),
  statement: z.string().min(10),
});

const createLicenseSchema = z.object({
  licenseType: z.enum([
    'owned_original', 'owned_license', 'creative_commons', 'public_domain',
    'sync_license', 'mechanical_license', 'other',
  ]),
  rightsHolder: z.string().optional(),
  attributionText: z.string().optional(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
  attestation: attestationSchema,
});

const updateLicenseSchema = z.object({
  rightsHolder: z.string().optional(),
  attributionText: z.string().optional(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
});

export async function licenseRoutes(app: FastifyInstance) {
  app.post('/api/v1/licenses', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const body = createLicenseSchema.parse(request.body);
    const license = await createLicense({
      userId: request.userId!,
      ...body,
      attestation: { ...body.attestation, ip: request.ip },
    });
    return reply.status(201).send(license);
  });

  app.get('/api/v1/licenses', {
    preHandler: [authMiddleware],
  }, async (request) => {
    return listLicenses(request.userId!);
  });

  app.get('/api/v1/licenses/:id', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const { id } = request.params as { id: string };
    return getLicense(request.userId!, id);
  });

  app.patch('/api/v1/licenses/:id', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = updateLicenseSchema.parse(request.body);
    return updateLicense(request.userId!, id, body);
  });

  app.patch('/api/v1/licenses/:id/revoke', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const { id } = request.params as { id: string };
    await revokeLicense(request.userId!, id);
    return { ok: true };
  });
}
