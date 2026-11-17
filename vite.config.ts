import { defineConfig } from 'vite';

// Saat pengembangan, permintaan /api diteruskan ke server lokal (npm run dev:api).
export default defineConfig({
  server: { proxy: { '/api': 'http://localhost:3001' } },
  build: { outDir: 'dist' },
});
