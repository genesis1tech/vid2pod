import ffmpeg from 'fluent-ffmpeg';
import { getConfig } from '../config.js';
import { createChildLogger } from '../shared/logger.js';
import { AppError } from '../shared/errors.js';
import { writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const log = createChildLogger('normalizer');

export interface NormalizeOptions {
  inputPath: string;
  outputPath: string;
  targetLufs: number;
  truePeak?: number;
}

interface LoudnessStats {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
}

function parseLoudnormStats(stderr: string): LoudnessStats | null {
  const match = stderr.match(/Parsed_loudnorm[^]*?I:\s*([-\d.]+)[^]*?TP:\s*([-\d.]+)[^]*?LRA:\s*([-\d.]+)[^]*?Threshold:\s*([-\d.]+)/);
  if (!match) return null;
  return { input_i: match[1], input_tp: match[2], input_lra: match[3], input_thresh: match[4] };
}

export async function normalize(opts: NormalizeOptions): Promise<string> {
  const config = getConfig();
  const truePeak = opts.truePeak ?? -1.5;

  const stats = await analyzeLoudness(opts.inputPath, config);
  if (!stats) {
    log.warn({ inputPath: opts.inputPath }, 'Could not analyze loudness, skipping normalization');
    return opts.inputPath;
  }

  log.info({ stats, target: opts.targetLufs }, 'Loudness analysis complete');

  return applyNormalization(opts, stats, config);
}

async function analyzeLoudness(inputPath: string, config: ReturnType<typeof getConfig>): Promise<LoudnessStats | null> {
  return new Promise((resolve) => {
    let stderrData = '';
    ffmpeg(inputPath)
      .setFfmpegPath(config.FFMPEG_PATH)
      .audioFilters(`loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json`)
      .format('null')
      .on('stderr', (line) => { stderrData += line + '\n'; })
      .on('end', () => {
        resolve(parseLoudnormStats(stderrData));
      })
      .on('error', (err) => {
        log.error({ err }, 'Loudness analysis failed');
        resolve(null);
      })
      .save('-');
  });
}

async function applyNormalization(opts: NormalizeOptions, stats: LoudnessStats, config: ReturnType<typeof getConfig>): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(opts.inputPath)
      .setFfmpegPath(config.FFMPEG_PATH)
      .audioFilters(
        `loudnorm=I=${opts.targetLufs}:TP=${opts.truePeak ?? -1.5}:LRA=11:measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}:linear=true`
      )
      .on('end', () => {
        log.info({ outputPath: opts.outputPath }, 'Normalization completed');
        resolve(opts.outputPath);
      })
      .on('error', (err) => {
        log.error({ err }, 'Normalization failed');
        reject(new AppError(`Normalization failed: ${err.message}`, 500));
      })
      .save(opts.outputPath);
  });
}
