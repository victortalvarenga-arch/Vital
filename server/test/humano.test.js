import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, subirApi, apagarEmpresa } from './ambiente.js';

/**
 * O cadastro com o Turnstile ligado.
 *
 * A Cloudflare é trocada por um `fetch` falso: a suíte não depende de rede.
 * O falso responde como a Cloudflare responde às chaves de teste oficiais —
 * token "passa" vale, qualquer outro não.
 */

let db, api;
const criadas = [];
const fetchDeVerdade = globalThis.fetch;
let cloudflareFora = false;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  process.env.TURNSTILE_SECRET = 'segredo-de-teste';
  process.env.TURNSTILE_SITE_KEY = 'chave-publica-de-teste';
  globalThis.fetch = async (url, opcoes) => {
    if (!String(url).includes('challenges.cloudflare.com')) return fetchDeVerdade(url, opcoes);
    if (cloudflareFora) throw new Error('rede caiu');
    const token = new URLSearchParams(String(opcoes.body)).get('response');
    return new Response(JSON.stringify({ success: token === 'passa' }), { headers: { 'content-type': 'application/json' } });
  };
});

after(async () => {
  globalThis.fetch = fetchDeVerdade;
  delete process.env.TURNSTILE_SECRET;
  delete process.env.TURNSTILE_SITE_KEY;
  // Pelo nome, e não só pelo que foi anotado: um teste que falha pode ter
  // criado empresa sem chegar a anotar.
  const sobras = await db.db.all(`SELECT id FROM plataforma.tenants WHERE slug LIKE 'humano-teste%'`);
  for (const id of new Set([...criadas, ...sobras.map(s => s.id)])) await apagarEmpresa(id);
  const { esquecerCacheDeEmpresas } = await import('../src/lib/tenant.js');
  esquecerCacheDeEmpresas();
  await api.fechar();
  await db.pool.end();
});

const cadastrar = turnstile => api.anonimo()('POST', '/api/cadastro', {
  nome: 'Humano Teste', responsavel: 'Fulana', email: 'fulana@humano.test',
  senha: 'senha-humano-1234', turnstile,
});

describe('cadastro com verificação anti-robô', () => {
  test('a tela recebe a chave pública, nunca a secreta', async () => {
    const r = await api.anonimo()('GET', '/api/cadastro/config');
    assert.deepEqual(r.corpo, { turnstile: 'chave-publica-de-teste' });
  });

  test('sem token, ou com token recusado, não cria empresa', async () => {
    assert.equal((await cadastrar(undefined)).status, 400);
    assert.equal((await cadastrar('robo')).status, 400);
    const { n } = await db.db.get(`SELECT COUNT(*) n FROM plataforma.tenants WHERE slug LIKE 'humano-teste%'`);
    assert.equal(n, 0);
  });

  test('Cloudflare fora do ar: recusa, em vez de deixar passar', async () => {
    cloudflareFora = true;
    try {
      const r = await cadastrar('passa');
      assert.equal(r.status, 400);
      assert.match(r.corpo.erro, /instantes/);
    } finally {
      cloudflareFora = false;
    }
  });

  test('com token aceito, cria', async () => {
    const r = await cadastrar('passa');
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    criadas.push(r.corpo.empresa.id);
  });
});
