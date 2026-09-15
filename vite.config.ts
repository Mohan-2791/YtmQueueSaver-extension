import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx, type ManifestV3Export } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

// CRXJS reads manifest.json as-is (including the .ts/.html paths you already
// point at for the service worker, content script, popup, and options page)
// and rewrites them into a proper MV3 build with HMR support in dev.
export default defineConfig({
  plugins: [react(), crx({ manifest: manifest as ManifestV3Export })],
  server: {
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
