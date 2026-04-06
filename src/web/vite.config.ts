import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: resolve(__dirname),
  envDir: resolve(__dirname, '../..'),
  build: {
    outDir: resolve(__dirname, '../../dist/web'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://localhost:3000',
      '/feed': 'http://localhost:3000',
      '/storage': 'http://localhost:3000',
      '/subscribe': 'http://localhost:3000',
    },
  },
});
