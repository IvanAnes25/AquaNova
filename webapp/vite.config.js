import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const apiProxyTarget = process.env.AQUATICA_API_PROXY_TARGET || 'http://localhost';

export default defineConfig(({ command }) => ({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  base: command === 'serve' ? '/webapp/' : './',
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: apiProxyTarget,
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
