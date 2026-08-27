import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // O front chama '/api/...' e o Vite repassa para o Express.
    // Assim não há CORS nem URL diferente entre dev e produção.
    proxy: { '/api': { target: 'http://localhost:3333', changeOrigin: true } },
  },
});
