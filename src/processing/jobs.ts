import { Queue, Worker } from 'bullmq';
import { getConfig } from '../config.js';
import { getDb } from '../db/client.js';
import { assets, processingJobs, episodes, feeds } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { extractMetadata } from './metadata-extractor.js';
import { transcode } from './transcoder.js';
import { normalize } from './normalizer.js';
import { uploadFile, getSignedDownloadUrl } from '../publishing/storage.js';
import { validateLicense } from '../licensing/service.js';
import { createChildLogger } from '../shared/logger.js';
import { NotFoundError } from '../shared/errors.js';
import { writeFile, readFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { v4 as uuid } from 'uuid';

const log = createChildLogger('jobs');

export const PROCESSING_QUEUE = 'vid2pod-processing';

export function getProcessingQueue(): Queue {
  const config = getConfig();
  return new Queue(PROCESSING_QUEUE, {
    connection: { url: config.REDIS_URL },
  });
}

export interface ProcessingJobData {
  assetId: string;
  userId: string;
  targetFormat?: 'mp3' | 'm4a';
}

export async function enqueueProcessingJob(data: ProcessingJobData) {
  const queue = getProcessingQueue();
  const job = await queue.add('process-asset', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });
  log.info({ jobId: job.id, assetId: data.assetId }, 'Processing job enqueued');
  return job;
}

export async function processAsset(data: ProcessingJobData): Promise<void> {
  const config = getConfig();
  const db = getDb();

  const assetRows = await db.select().from(assets).where(eq(assets.id, data.assetId)).limit(1);
  const asset = assetRows[0];
  if (!asset) throw new NotFoundError('Asset');

  await validateLicense(asset.licenseId);

  await db.update(assets)
    .set({ processingStatus: 'processing', updatedAt: new Date() })
    .where(eq(assets.id, asset.id));

  const workDir = join(tmpdir(), `vid2pod-${asset.id}`);
  await mkdir(workDir, { recursive: true });

  try {
    let inputPath: string;

    if (asset.sourceType === 'stream_url' && asset.streamUrl) {
      const response = await fetch(asset.streamUrl);
      if (!response.ok) throw new Error(`Failed to fetch stream: ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      inputPath = join(workDir, `input${asset.originalFilename ? '.' + asset.originalFilename.split('.').pop() : '.mp3'}`);
      await writeFile(inputPath, buffer);
    } else if (asset.storageKey) {
      const { getFile } = await import('../publishing/storage.js');
      const stream = await getFile(asset.storageKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      inputPath = join(workDir, asset.originalFilename || 'input.mp3');
      await writeFile(inputPath, buffer);
    } else {
      throw new Error('Asset has no storage key or stream URL');
    }

    const meta = await extractMetadata(inputPath);

    await db.update(assets)
      .set({
        metadata: meta,
        updatedAt: new Date(),
      })
      .where(eq(assets.id, asset.id));

    const targetFormat = data.targetFormat || 'mp3';
    const outputPath = join(workDir, `output.${targetFormat}`);

    await transcode({
      inputPath,
      outputPath,
      format: targetFormat,
      bitrate: config.DEFAULT_BITRATE,
    });

    const normalizedPath = join(workDir, `normalized.${targetFormat}`);
    await normalize({
      inputPath: outputPath,
      outputPath: normalizedPath,
      targetLufs: config.DEFAULT_TARGET_LUFS,
    });

    const finalBuffer = await readFile(normalizedPath);
    const outputKey = `processed/${asset.userId}/${asset.id}/episode.${targetFormat}`;
    await uploadFile(outputKey, finalBuffer, targetFormat === 'mp3' ? 'audio/mpeg' : 'audio/mp4');

    const updatedMeta: Record<string, any> = {
      ...meta,
      processedFormat: targetFormat,
      processedKey: outputKey,
      processedSize: finalBuffer.length,
    };

    await db.update(assets)
      .set({
        processingStatus: 'completed',
        metadata: updatedMeta as any,
        updatedAt: new Date(),
      })
      .where(eq(assets.id, asset.id));

    log.info({ assetId: asset.id }, 'Asset processing completed');
  } catch (err) {
    await db.update(assets)
      .set({ processingStatus: 'failed', updatedAt: new Date() })
      .where(eq(assets.id, asset.id));
    log.error({ err, assetId: asset.id }, 'Asset processing failed');
    throw err;
  } finally {
    try { await unlink(workDir).catch(() => {}); } catch {}
  }
}
