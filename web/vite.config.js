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

    // Escuta em todas as interfaces para que `empresa.localhost:5173` chegue
    // aqui: o navegador resolve qualquer `*.localhost` para 127.0.0.1, mas o
    // Vite, preso a `localhost`, não atendia nesse endereço.
    host: true,

    /**
     * O front chama '/api/...' e o Vite repassa para o Express. Assim não há
     * CORS nem URL diferente entre dev e produção.
     *
     * **`changeOrigin: false` é essencial e não é detalhe.** Com `true`, o
     * proxy reescreve o cabeçalho `Host` para o do destino — e é o `Host` que
     * diz de qual empresa é a requisição. Toda chamada viraria a empresa
     * padrão, e não haveria como abrir o site de uma segunda empresa em
     * desenvolvimento.
     */
    proxy: {
      '/api': { target: 'http://localhost:3333', changeOrigin: false },
      // As imagens enviadas pelas empresas são servidas pelo Express.
      '/uploads': { target: 'http://localhost:3333', changeOrigin: false },
    },
  },
});
