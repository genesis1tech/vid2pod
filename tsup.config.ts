import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'processing/worker': 'src/processing/worker.ts',
    cli: 'src/cli/index.ts',
  },
  format: ['esm'],
  target: 'node22',
  splitting: true,
  sourcemap: true,
  clean: true,
  dts: false,
  external: ['pg-native', 'ffmpeg', 'ffprobe'],
});
