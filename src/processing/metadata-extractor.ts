import ffmpeg from 'fluent-ffmpeg';
import { getConfig } from '../config.js';
import { createChildLogger } from '../shared/logger.js';
import { AppError } from '../shared/errors.js';

const log = createChildLogger('metadata-extractor');

export interface AudioFileInfo {
  duration: number;
  bitrate: number;
  sampleRate: number;
  channels: number;
  codec: string;
}

export function extractMetadata(inputPath: string): Promise<AudioFileInfo> {
  const config = getConfig();

  return new Promise((resolve, reject) => {
    ffmpeg.setFfprobePath(config.FFPROBE_PATH);

    ffmpeg(inputPath).ffprobe((err, data) => {
      if (err) {
        log.error({ err, inputPath }, 'ffprobe failed');
        return reject(new AppError(`Metadata extraction failed: ${err.message}`, 500));
      }

      const audioStream = data.streams.find(s => s.codec_type === 'audio');
      if (!audioStream) {
        return reject(new AppError('No audio stream found', 400));
      }

      const result: AudioFileInfo = {
        duration: data.format.duration || 0,
        bitrate: data.format.bit_rate ? parseInt(String(data.format.bit_rate), 10) : 0,
        sampleRate: audioStream.sample_rate || 44100,
        channels: audioStream.channels || 2,
        codec: audioStream.codec_name || 'unknown',
      };

      log.info({ inputPath, duration: result.duration, codec: result.codec }, 'Metadata extracted');
      resolve(result);
    });
  });
}

export function getDurationFromSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
