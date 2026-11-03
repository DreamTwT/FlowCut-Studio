import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  root: path.resolve(__dirname, 'client'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  build: {
    outDir: path.resolve(__dirname, 'public-app'),
    emptyOutDir: true,
  },
});
