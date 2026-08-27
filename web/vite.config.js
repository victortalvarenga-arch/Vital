import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],

  /**
   * Duas entradas, dois bundles: o site da cliente e o painel da equipe.
   *
   * Antes os dois saíam do mesmo `App.jsx`, o que significava que abrir o site
   * baixava o painel junto — código de financeiro e de cadastro indo para o
   * navegador de quem só quer marcar horário. Separado, cada página carrega só
   * o que é dela, e mexer numa não arrisca a outra.
   */
  build: {
    rollupOptions: {
      input: {
        site: resolve(import.meta.dirname, 'index.html'),
        painel: resolve(import.meta.dirname, 'painel.html'),
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
