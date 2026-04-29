import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 9010,
    proxy: {
      '/api': {
        target: 'http://localhost:9020',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:9020',
        ws: true,
      },
    },
  },
});
