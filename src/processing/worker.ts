import { Worker, Queue } from 'bullmq';
import { getConfig } from '../config.js';
import { PROCESSING_QUEUE, processAsset, ProcessingJobData } from './jobs.js';
import { createChildLogger } from '../shared/logger.js';

const log = createChildLogger('worker');

export async function startWorker() {
  const config = getConfig();

  log.info('Starting processing worker...');

  const worker = new Worker<ProcessingJobData>(
    PROCESSING_QUEUE,
    async (job) => {
      log.info({ jobId: job.id, assetId: job.data.assetId }, 'Processing job started');
      await processAsset(job.data);
    },
    {
      connection: { url: config.REDIS_URL },
      concurrency: 2,
    },
  );

  worker.on('completed', (job) => {
    log.info({ jobId: job.id }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, err: err.message }, 'Job failed');
  });

  worker.on('error', (err) => {
    log.error({ err }, 'Worker error');
  });

  log.info('Worker ready');

  const shutdown = async () => {
    log.info('Shutting down worker...');
    await worker.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (process.argv[1]?.includes('worker')) {
  startWorker().catch((err) => {
    log.error({ err }, 'Worker failed to start');
    process.exit(1);
  });
}
