import { describe, expect, test } from 'vitest';
import { parseLoudnormStats } from '../src/processing/normalizer.js';

describe('parseLoudnormStats', () => {
  test('parses ffmpeg loudnorm JSON output', () => {
    const stderr = `
[Parsed_loudnorm_0 @ 0x7fd] 
{
    "input_i" : "-19.43",
    "input_tp" : "-2.35",
    "input_lra" : "7.10",
    "input_thresh" : "-29.54",
    "output_i" : "-16.02",
    "normalization_type" : "dynamic"
}
`;

    expect(parseLoudnormStats(stderr)).toEqual({
      input_i: '-19.43',
      input_tp: '-2.35',
      input_lra: '7.10',
      input_thresh: '-29.54',
    });
  });

  test('keeps compatibility with text loudnorm output', () => {
    const stderr = `
[Parsed_loudnorm_0 @ 0x7fd]
Input Integrated:    I:         -18.1 LUFS
Input True Peak:     TP:         -1.8 dBTP
Input LRA:           LRA:         6.2 LU
Input Threshold:     Threshold: -28.4 LUFS
`;

    expect(parseLoudnormStats(stderr)).toEqual({
      input_i: '-18.1',
      input_tp: '-1.8',
      input_lra: '6.2',
      input_thresh: '-28.4',
    });
  });

  test('returns null when loudnorm stats are absent', () => {
    expect(parseLoudnormStats('no loudnorm data')).toBeNull();
  });
});
