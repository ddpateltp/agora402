import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Dev: Vite serves the pages and proxies /api to the buyer dashboard on 4403.
// Prod: `vite build` writes dist/, which the dashboard serves itself.
export default defineConfig({
  plugins: [vue()],
  server: { proxy: { '/api': 'http://localhost:4403' } },
  build: { outDir: 'dist', emptyOutDir: true },
});
