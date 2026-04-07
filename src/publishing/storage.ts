import {
  S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { getConfig } from '../config.js';
import { createChildLogger } from '../shared/logger.js';

const log = createChildLogger('storage');

let _client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!_client) {
    const config = getConfig();
    _client = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY,
        secretAccessKey: config.S3_SECRET_KEY,
      },
      forcePathStyle: true,
    });
  }
  return _client;
}

export async function uploadFile(key: string, body: Buffer | NodeJS.ReadableStream | ReadableStream, contentType?: string): Promise<string> {
  const config = getConfig();
  const client = getS3Client();

  const upload = new Upload({
    client,
    params: {
      Bucket: config.S3_BUCKET,
      Key: key,
      Body: body as any,
      ContentType: contentType,
    },
  });

  await upload.done();
  log.info({ key }, 'File uploaded');
  return key;
}

export async function getFile(key: string): Promise<NodeJS.ReadableStream> {
  const config = getConfig();
  const client = getS3Client();

  const result = await client.send(new GetObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: key,
  }));

  return result.Body as NodeJS.ReadableStream;
}

export async function deleteFile(key: string): Promise<void> {
  const config = getConfig();
  const client = getS3Client();

  await client.send(new DeleteObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: key,
  }));
  log.info({ key }, 'File deleted');
}

export async function getSignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
  const config = getConfig();
  const client = getS3Client();

  return getSignedUrl(client, new GetObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: key,
  }), { expiresIn });
}

export async function getPublicUrl(key: string): Promise<string> {
  const config = getConfig();
  return `${config.BASE_URL}/storage/${key}`;
}

export async function getFileInfo(key: string) {
  const config = getConfig();
  const client = getS3Client();

  return client.send(new HeadObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: key,
  }));
}

export async function uploadToPodcastBucket(key: string, body: Buffer | NodeJS.ReadableStream | ReadableStream, contentType?: string): Promise<string> {
  const config = getConfig();
  const client = getS3Client();

  const upload = new Upload({
    client,
    params: {
      Bucket: config.S3_PODCAST_BUCKET,
      Key: key,
      Body: body as any,
      ContentType: contentType,
    },
  });

  await upload.done();
  log.info({ key, bucket: config.S3_PODCAST_BUCKET }, 'File uploaded to podcast bucket');
  return key;
}

export async function getPodcastFile(key: string, range?: string) {
  const config = getConfig();
  const client = getS3Client();

  const params: any = {
    Bucket: config.S3_PODCAST_BUCKET,
    Key: key,
  };
  if (range) {
    params.Range = range;
  }

  return client.send(new GetObjectCommand(params));
}

export async function deletePodcastFile(key: string): Promise<void> {
  const config = getConfig();
  const client = getS3Client();

  await client.send(new DeleteObjectCommand({
    Bucket: config.S3_PODCAST_BUCKET,
    Key: key,
  }));
  log.info({ key, bucket: config.S3_PODCAST_BUCKET }, 'File deleted from podcast bucket');
}

export async function getPodcastFileInfo(key: string) {
  const config = getConfig();
  const client = getS3Client();

  return client.send(new HeadObjectCommand({
    Bucket: config.S3_PODCAST_BUCKET,
    Key: key,
  }));
}
