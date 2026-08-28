import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],

  /**
   * Três entradas, três bundles, um público cada: o site de quem agenda, o
   * painel de quem atende, e a página da Vital — onde uma empresa se cadastra
   * e onde a nossa equipe administra a plataforma.
   *
   * Antes site e painel saíam do mesmo `App.jsx`, o que significava que abrir o
   * site baixava o painel junto — código de financeiro indo para o navegador de
   * quem só quer marcar horário. Separado, cada página carrega só o que é dela,
   * e mexer numa não arrisca a outra. O bundle da Vital nunca é servido no
   * endereço de uma empresa.
   */
  build: {
    rollupOptions: {
      input: {
        site: resolve(import.meta.dirname, 'index.html'),
        painel: resolve(import.meta.dirname, 'painel.html'),
        vital: resolve(import.meta.dirname, 'vital.html'),
      },
    },
  },

  server: {
    port: 5173,
    // O front chama '/api/...' e o Vite repassa para o Express.
    // Assim não há CORS nem URL diferente entre dev e produção.
    proxy: {
      '/api': { target: 'http://localhost:3333', changeOrigin: true },
      // As imagens enviadas pelas empresas são servidas pelo Express.
      '/uploads': { target: 'http://localhost:3333', changeOrigin: true },
    },
  },
});
