import { FastifyInstance } from 'fastify';
import { uploadAsset, addStreamUrl, listAssets, getAsset, deleteAsset, fetchYouTubeMetadata } from './service.js';
import { addYouTubeVideo } from './youtube.js';
import { authMiddleware } from '../auth/middleware.js';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { assets, episodes, feeds } from '../db/schema.js';
import { getConfig } from '../config.js';
import { uploadFile, uploadToPodcastBucket } from '../publishing/storage.js';
import { enqueueProcessingJob } from '../processing/jobs.js';
import { ACCEPTED_AUDIO_TYPES, MAX_UPLOAD_SIZE } from '../shared/constants.js';
import { ValidationError, NotFoundError } from '../shared/errors.js';
import { createChildLogger } from '../shared/logger.js';

const log = createChildLogger('ingestion-routes');

const addVideoSchema = z.object({
  url: z.string().url(),
});

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
  // Agent endpoints — local agent polls for pending downloads and uploads results

  // List videos waiting for agent download
  app.get('/api/v1/agent/pending', {
    preHandler: [authMiddleware],
  }, async (request) => {
    const db = getDb();
    return db.select().from(assets)
      .where(and(
        eq(assets.userId, request.userId!),
        eq(assets.processingStatus, 'pending_download'),
      ));
  });

  // Agent uploads downloaded audio for an asset
  app.post('/api/v1/agent/upload/:assetId', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const { assetId } = request.params as { assetId: string };
    const data = await request.file();
    if (!data) throw new ValidationError('No file provided');

    const db = getDb();

    // Verify asset belongs to user and is pending download
    const rows = await db.select().from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.userId, request.userId!)))
      .limit(1);
    if (rows.length === 0) throw new NotFoundError('Asset');
    const asset = rows[0];
    if (asset.processingStatus !== 'pending_download') {
      throw new ValidationError('Asset is not pending download');
    }

    const buffer = await data.toBuffer();

    // Parse metadata from multipart fields
    const getField = (name: string) => {
      const f = data.fields[name];
      return f && 'value' in f ? f.value as string : undefined;
    };
    const title = getField('title');
    const description = getField('description');
    const duration = getField('duration');
    const thumbnail = getField('thumbnail');

    // Upload to storage
    const storageKey = `assets/${request.userId}/${assetId}/${data.filename || 'audio.mp3'}`;
    await uploadFile(storageKey, buffer, data.mimetype);

    // Update asset — mark as pending (ready for server-side processing)
    await db.update(assets)
      .set({
        storageKey,
        originalFilename: data.filename,
        mimeType: data.mimetype,
        fileSizeBytes: buffer.length,
        processingStatus: 'pending',
        updatedAt: new Date(),
      })
      .where(eq(assets.id, assetId));

    // Update episode with metadata from YouTube
    if (title || description || duration) {
      const linkedEps = await db.select().from(episodes)
        .where(eq(episodes.assetId, assetId));
      for (const ep of linkedEps) {
        await db.update(episodes).set({
          ...(title && { title }),
          ...(description && { description }),
          ...(duration && { durationSeconds: Math.round(parseFloat(duration)) }),
          ...(thumbnail && { imageUrl: thumbnail }),
          updatedAt: new Date(),
        }).where(eq(episodes.id, ep.id));
      }
    }

    // Queue server-side processing (transcode + normalize)
    await enqueueProcessingJob({
      assetId,
      userId: request.userId!,
      targetFormat: 'mp3',
    });

    return reply.status(200).send({ ok: true, status: 'processing' });
  });

  // Upload/regenerate podcast cover image
  app.post('/api/v1/feeds/:feedId/cover', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const { feedId } = request.params as { feedId: string };
    const db = getDb();
    const config = getConfig();

    const feedRows = await db.select().from(feeds)
      .where(and(eq(feeds.id, feedId), eq(feeds.userId, request.userId!)))
      .limit(1);
    if (feedRows.length === 0) throw new NotFoundError('Feed');

    const { readFile } = await import('fs/promises');
    const { resolve, dirname } = await import('path');
    const { fileURLToPath } = await import('url');
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const coverBuffer = await readFile(resolve(__dirname, '../../static/viddypod-cover.png'));

    const coverKey = `covers/${request.userId}/${feedId}.png`;
    await uploadToPodcastBucket(coverKey, coverBuffer, 'image/png');
    const imageUrl = `${config.BASE_URL}/storage/${coverKey}`;

    await db.update(feeds)
      .set({ imageUrl, updatedAt: new Date() })
      .where(eq(feeds.id, feedId));

    return reply.status(200).send({ ok: true, imageUrl });
  });

  // Primary endpoint: add a YouTube video to personal library
  app.post('/api/v1/videos', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    const body = addVideoSchema.parse(request.body);
    const result = await addYouTubeVideo({
      userId: request.userId!,
      url: body.url,
    });
    return reply.status(201).send(result);
  });

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
