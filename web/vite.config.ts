import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': { target: `http://127.0.0.1:${process.env.PORT || 8787}`, changeOrigin: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
