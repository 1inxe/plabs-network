import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { createJubjubProxyHandler, jubjubProxyEnabled } from './server/jubjub-proxy.mjs';

const upstreams = {
  market: 'https://app.plabs.online/dex-matcher',
  monad: 'https://monad-indexer.plabs.online',
  ethereum: 'https://eth-indexer.plabs.online',
  platform: 'https://api.plabs.online',
  'nft-media': 'https://media.plabs.online',
};
const proxy = Object.fromEntries(
  Object.entries(upstreams).map(([name, target]) => [
    `/api/${name}`,
    {
      target,
      changeOrigin: true,
      secure: true,
      rewrite: (path: string) => path.replace(`/api/${name}`, ''),
    },
  ]),
);
const jubjubProxy: Plugin = {
  name: 'jubjub-same-origin-proxy',
  configureServer(server) {
    if (!jubjubProxyEnabled(server.config.server.proxy)) return;
    const handler = createJubjubProxyHandler();
    const nft = createJubjubProxyHandler({ protocol: 'nft' });
    server.middlewares.use((req, res, next) => {
      if (/^\/api\/jubjub(?:\/|\?|$)/.test(req.url ?? '')) void handler(req, res);
      else if (/^\/api\/nft(?:\/|\?|$)/.test(req.url ?? '')) void nft(req, res);
      else next();
    });
  },
  configurePreviewServer(server) {
    if (!jubjubProxyEnabled(server.config.preview.proxy)) return;
    const handler = createJubjubProxyHandler();
    const nft = createJubjubProxyHandler({ protocol: 'nft' });
    server.middlewares.use((req, res, next) => {
      if (/^\/api\/jubjub(?:\/|\?|$)/.test(req.url ?? '')) void handler(req, res);
      else if (/^\/api\/nft(?:\/|\?|$)/.test(req.url ?? '')) void nft(req, res);
      else next();
    });
  },
};
export default defineConfig({
  plugins: [react(), tailwindcss(), jubjubProxy],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5180, strictPort: true, proxy },
  preview: { port: 5180, strictPort: true, proxy },
  build: {
    target: 'es2022',
    sourcemap: 'hidden',
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('lightweight-charts')) return 'charts';
          if (
            id.includes('node_modules') &&
            (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/react-router'))
          )
            return 'react-vendor';
        },
      },
    },
  },
});
