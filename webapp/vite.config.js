import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ command }) => ({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  base: command === 'serve' ? '/webapp/' : './',
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost',
        changeOrigin: true,
        rewrite: (path) => `/AquaNova${path}`,
      },
    },
  },
  build: {
    outDir: fileURLToPath(new URL('../public/webapp', import.meta.url)),
    emptyOutDir: true,
  },
}));
