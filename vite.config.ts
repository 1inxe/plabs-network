import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const upstreams = {
  market: 'https://app.plabs.online/dex-matcher',
  monad: 'https://monad-indexer.plabs.online',
  ethereum: 'https://eth-indexer.plabs.online',
  platform: 'https://api.plabs.online',
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
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
