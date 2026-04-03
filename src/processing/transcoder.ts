import ffmpeg from 'fluent-ffmpeg';
import { getConfig } from '../config.js';
import { createChildLogger } from '../shared/logger.js';
import { AppError } from '../shared/errors.js';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const log = createChildLogger('transcoder');

export interface TranscodeOptions {
  inputPath: string;
  outputPath: string;
  format: 'mp3' | 'm4a';
  bitrate: number;
  sampleRate?: number;
}

export async function transcode(opts: TranscodeOptions): Promise<string> {
  const config = getConfig();

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg(opts.inputPath)
      .setFfmpegPath(config.FFMPEG_PATH)
      .audioCodec(opts.format === 'mp3' ? 'libmp3lame' : 'aac')
      .audioBitrate(opts.bitrate / 1000)
      .audioFrequency(opts.sampleRate || 44100)
      .audioChannels(2)
      .format(opts.format === 'mp3' ? 'mp3' : 'mp4')
      .on('start', (cmdLine) => log.info({ cmd: cmdLine }, 'Transcode started'))
      .on('progress', (progress) => {
        if (progress.percent) log.debug({ percent: progress.percent }, 'Transcode progress');
      })
      .on('end', () => {
        log.info({ outputPath: opts.outputPath }, 'Transcode completed');
        resolve(opts.outputPath);
      })
      .on('error', (err) => {
        log.error({ err }, 'Transcode failed');
        reject(new AppError(`Transcode failed: ${err.message}`, 500));
      });

    cmd.save(opts.outputPath);
  });
}
