import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

// Dev: Vite serves the pages and proxies /api to the buyer dashboard on 4403.
// Prod: `vite build` writes dist/, which the dashboard serves itself.
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: { proxy: { '/api': 'http://localhost:4403' } },
  build: { outDir: 'dist', emptyOutDir: true },
});
