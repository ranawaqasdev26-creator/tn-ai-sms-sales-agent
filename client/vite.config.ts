import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    // Allows the Cloudflare Tunnel hostname (and any other) through Vite's
    // Host-header check. Fine for a temporary tunnel; tighten if this
    // config is ever reused for a real public deployment.
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:3005',
      '/ws': { target: 'ws://localhost:3005', ws: true },
      '/keith-api': {
        target: 'http://localhost:8005',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/keith-api/, '/api'),
      },
    },
  },
});
