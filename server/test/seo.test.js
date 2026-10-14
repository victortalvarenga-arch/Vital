import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepararBanco, limpar, cenario, subirApi } from './ambiente.js';

/**
 * O `<head>` do site escrito no servidor — o que a prévia de link do WhatsApp
 * lê, porque ela não roda JavaScript.
 */

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist/index.html');
const HTML = `<!doctype html><html><head>
<meta name="description" content="Agende seu horário online, com confirmação na hora." />
<title>Agende seu horário</title>
</head><body></body></html>`;

let db, api, seo;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  seo = await import('../src/lib/seo.js');
  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
    await db.setConfig({
      nome: 'Estúdio Lume', cidade: 'Joinville', sobre: 'Cuidado sem pressa.',
      marca: { capa: '/uploads/default/capa.jpg' },
    });
  });
});

after(async () => {
  await api.fechar();
  await db.pool.end();
});

describe('prévia de link', () => {
  test('título, descrição e imagem da empresa no HTML', () => {
    const html = seo.comCabecalho(HTML, {
      cfg: { nome: 'Estúdio Lume', cidade: 'Joinville', sobre: 'Cuidado sem pressa.', marca: { capa: '/uploads/x/capa.jpg' } },
      servicos: [{ nome: 'Corte', categoria: 'Cabelo' }],
      origem: 'https://lume.vital.test',
    });
    assert.match(html, /<title>Estúdio Lume — Cabelo em Joinville<\/title>/);
    assert.match(html, /<meta name="description" content="Cuidado sem pressa\. Cabelo em Joinville\. Agende online/);
    assert.match(html, /og:image" content="https:\/\/lume\.vital\.test\/uploads\/x\/capa\.jpg"/);
    assert.equal((html.match(/<title>/g) || []).length, 1, 'um título só');
  });

  test('nome da empresa com HTML não vira HTML na página', () => {
    const html = seo.comCabecalho(HTML, {
      cfg: { nome: '"><script>alert(1)</script>', marca: {} }, servicos: [], origem: 'https://x.test',
    });
    assert.ok(!html.includes('<script>alert(1)'), 'o nome sai escapado');
    assert.match(html, /&lt;script&gt;/);
  });

  test('a página servida já sai com o head da empresa', { skip: !fs.existsSync(DIST) && 'sem web/dist (rode o build)' }, async () => {
    const r = await api.anonimo()('GET', '/');
    assert.equal(r.status, 200);
    assert.match(r.corpo, /<title>Estúdio Lume — Cabelo em Joinville<\/title>/);
    assert.match(r.corpo, /og:image" content="http:\/\/127\.0\.0\.1:\d+\/uploads\/default\/capa\.jpg"/);
  });
});
