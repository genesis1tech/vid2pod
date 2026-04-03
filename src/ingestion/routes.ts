import { FastifyInstance } from 'fastify';
import { uploadAsset, addStreamUrl, listAssets, getAsset, deleteAsset, fetchYouTubeMetadata } from './service.js';
import { authMiddleware } from '../auth/middleware.js';
import { z } from 'zod';
import { ACCEPTED_AUDIO_TYPES, MAX_UPLOAD_SIZE } from '../shared/constants.js';
import { ValidationError } from '../shared/errors.js';

const addStreamSchema = z.object({
  licenseId: z.string().uuid(),
  streamUrl: z.string().url(),
  filename: z.string().optional(),
});

const youtubeMetaSchema = z.object({
  licenseId: z.string().uuid(),
  videoId: z.string().min(1),
});

export async function ingestionRoutes(app: FastifyInstance) {
  app.post('/api/v1/assets/upload', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const data = await request.file();
    if (!data) throw new ValidationError('No file provided');

    if (!ACCEPTED_AUDIO_TYPES.includes(data.mimetype as any)) {
      throw new ValidationError(`Unsupported audio type: ${data.mimetype}`);
    }

    const licenseField = data.fields['licenseId'];
    const licenseId = (licenseField && 'value' in licenseField ? licenseField.value : String(licenseField)) as string;
    if (!licenseId) throw new ValidationError('licenseId is required');

    const buffer = await data.toBuffer();
    if (buffer.length > MAX_UPLOAD_SIZE) {
      throw new ValidationError(`File exceeds maximum size of ${MAX_UPLOAD_SIZE / 1024 / 1024}MB`);
    }

    const asset = await uploadAsset({
      userId: request.userId!,
      licenseId,
      fileBuffer: buffer,
      filename: data.filename,
      mimeType: data.mimetype,
    });

    return reply.status(201).send(asset);
  });

  app.post('/api/v1/assets/stream-url', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const body = addStreamSchema.parse(request.body);
    const asset = await addStreamUrl({
      userId: request.userId!,
      ...body,
    });
    return reply.status(201).send(asset);
  });

  app.post('/api/v1/assets/youtube-meta', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const body = youtubeMetaSchema.parse(request.body);
    const meta = await fetchYouTubeMetadata({
      userId: request.userId!,
      ...body,
    });
    return reply.status(200).send(meta);
  });

  app.get('/api/v1/assets', {
    preHandler: [authMiddleware],
  }, async (request) => {
    return listAssets(request.userId!);
  });

  app.get('/api/v1/assets/:id', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const { id } = request.params as { id: string };
    return getAsset(request.userId!, id);
  });

  app.delete('/api/v1/assets/:id', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const { id } = request.params as { id: string };
    await deleteAsset(request.userId!, id);
    return { ok: true };
  });
}
