import { Queue, Worker } from 'bullmq';
import { getConfig } from '../config.js';
import { getDb } from '../db/client.js';
import { assets, processingJobs, episodes, feeds } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { extractMetadata } from './metadata-extractor.js';
import { transcode } from './transcoder.js';
import { normalize } from './normalizer.js';
import { uploadFile, uploadToPodcastBucket, getSignedDownloadUrl } from '../publishing/storage.js';
import { validateLicense } from '../licensing/service.js';
import { createChildLogger } from '../shared/logger.js';
import { NotFoundError } from '../shared/errors.js';
import { writeFile, readFile, unlink, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { sanitizeFilename } from '../shared/sanitize.js';
import { assertPublicHttpUrl } from '../shared/url-guard.js';
import { v4 as uuid } from 'uuid';
import type { ProcessingStage } from '../shared/types.js';

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

  if (asset.licenseId) {
    await validateLicense(asset.userId, asset.licenseId);
  }

  let lastProgress = -1;
  let progressWrite = Promise.resolve();
  const setProgress = (stage: ProcessingStage, progress: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(progress)));
    if (clamped <= lastProgress && stage !== 'failed') return progressWrite;
    lastProgress = clamped;
    progressWrite = progressWrite.then(() => db.update(assets)
      .set({
        processingStatus: stage === 'ready' ? 'completed' : stage === 'failed' ? 'failed' : 'processing',
        processingStage: stage,
        processingProgress: clamped,
        updatedAt: new Date(),
      })
      .where(eq(assets.id, asset.id)).then(() => undefined));
    return progressWrite;
  };

  await setProgress('queued', 20);

  let workDir: string | null = null;

  try {
    let inputPath: string;

    // Download source audio from S3 (agent-uploaded or direct upload)
    if (asset.storageKey) {
      await setProgress('loading_source', 25);
      workDir = join(tmpdir(), `vid2pod-${asset.id}`);
      await mkdir(workDir, { recursive: true });
      const { getFile } = await import('../publishing/storage.js');
      const stream = await getFile(asset.storageKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      inputPath = join(workDir, sanitizeFilename(asset.originalFilename, 'input.mp3'));
      await writeFile(inputPath, buffer);
    } else if (asset.sourceType === 'stream_url' && asset.streamUrl) {
      await setProgress('loading_source', 25);
      workDir = join(tmpdir(), `vid2pod-${asset.id}`);
      await mkdir(workDir, { recursive: true });
      // Re-validate at fetch time to guard against SSRF / DNS rebinding.
      await assertPublicHttpUrl(asset.streamUrl);
      const response = await fetch(asset.streamUrl);
      if (!response.ok) throw new Error(`Failed to fetch stream: ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      inputPath = join(workDir, sanitizeFilename(asset.originalFilename, 'input.mp3'));
      await writeFile(inputPath, buffer);
    } else {
      throw new Error('Asset has no storage key or stream URL');
    }

    await setProgress('extracting_metadata', 35);
    const meta = await extractMetadata(inputPath);

    await db.update(assets)
      .set({
        metadata: meta,
        updatedAt: new Date(),
      })
      .where(eq(assets.id, asset.id));

    const targetFormat = data.targetFormat || 'mp3';
    const outputPath = join(workDir!, `output.${targetFormat}`);

    await setProgress('transcoding', 45);
    await transcode({
      inputPath,
      outputPath,
      format: targetFormat,
      bitrate: config.DEFAULT_BITRATE,
      onProgress: (percent) => setProgress('transcoding', 45 + (percent * 0.2)),
    });

    const normalizedPath = join(workDir!, `normalized.${targetFormat}`);
    const finalPath = await normalize({
      inputPath: outputPath,
      outputPath: normalizedPath,
      targetLufs: config.DEFAULT_TARGET_LUFS,
      onAnalysisStart: () => setProgress('analyzing_loudness', 68),
      onAnalysisComplete: () => setProgress('normalizing', 76),
      onProgress: (percent) => setProgress('normalizing', 76 + (percent * 0.12)),
    });

    await setProgress('uploading', 92);
    const finalBuffer = await readFile(finalPath);
    const outputKey = `processed/${asset.userId}/${asset.id}/episode.${targetFormat}`;
    await uploadToPodcastBucket(outputKey, finalBuffer, targetFormat === 'mp3' ? 'audio/mpeg' : 'audio/mp4');

    const updatedMeta: Record<string, any> = {
      ...meta,
      processedFormat: targetFormat,
      processedKey: outputKey,
      processedSize: finalBuffer.length,
    };

    await setProgress('publishing', 96);
    await db.update(assets)
      .set({ metadata: updatedMeta as any, updatedAt: new Date() })
      .where(eq(assets.id, asset.id));

    // Auto-publish: update linked episodes with enclosure info and publish
    const enclosureUrl = `${config.BASE_URL}/storage/${outputKey}`;
    const linkedEpisodes = await db.select().from(episodes)
      .where(eq(episodes.assetId, asset.id));

    for (const ep of linkedEpisodes) {
      await db.update(episodes)
        .set({
          enclosureUrl,
          enclosureSize: finalBuffer.length,
          enclosureType: targetFormat === 'mp3' ? 'audio/mpeg' : 'audio/mp4',
          durationSeconds: meta.duration ? Math.round(meta.duration) : null,
          status: 'published',
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(episodes.id, ep.id));

      // Update feed's lastPublishedAt
      await db.update(feeds)
        .set({ lastPublishedAt: new Date(), updatedAt: new Date() })
        .where(eq(feeds.id, ep.feedId));
    }

    await setProgress('ready', 100);
    log.info({ assetId: asset.id, episodesPublished: linkedEpisodes.length }, 'Asset processed and episodes auto-published');
  } catch (err) {
    await setProgress('failed', Math.max(lastProgress, 0));
    log.error({ err, assetId: asset.id }, 'Asset processing failed');
    throw err;
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
