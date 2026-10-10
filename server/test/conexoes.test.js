import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepararBanco, limpar, cenario, subirApi, criarEquipe } from './ambiente.js';

/**
 * Conexão com Google (avaliações) e Instagram (publicações).
 *
 * O Google e a Meta são trocados por um `fetch` falso — a suíte não pode
 * depender de conta real nem de rede. Todo o resto é de verdade: rota, sessão,
 * guarda de papel, `state` assinado, token cifrado no banco com RLS, job
 * escrevendo na config e a vitrine montada a dedo.
 *
 * O que mais importa provar: token nenhum sai por rota nenhuma; o retorno não
 * aceita `state` mexido; e o site só mostra o que veio da conta.
 */

// Antes de qualquer import de src/: as credenciais são lidas na hora do uso,
// mas o destino das imagens (disco ou R2) é decidido na carga de uploads.js.
// Sem zerar o R2, o teste subiria foto para o bucket de verdade.
process.env.CONEXOES_SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres!!';
process.env.CONEXOES_RETORNO_URL = 'https://api.exemplo.test';
process.env.GOOGLE_CLIENT_ID = 'g-id';
process.env.GOOGLE_CLIENT_SECRET = 'g-segredo';
process.env.INSTAGRAM_APP_ID = 'ig-id';
process.env.INSTAGRAM_APP_SECRET = 'ig-segredo';
for (const v of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) process.env[v] = '';

const PASTA_UPLOADS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads');

let db, api, dona, ana, chamadas, respostas;
const fetchDeVerdade = globalThis.fetch;
const arquivosCriados = new Set();

const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), {
  status, headers: { 'content-type': 'application/json' },
});

/** As respostas padrão dos provedores; um teste troca uma entrada para simular erro. */
function respostasPadrao() {
  return {
    'oauth2.googleapis.com/token': form => form.get('grant_type') === 'refresh_token'
      ? json({ access_token: 'g-acesso-renovado', expires_in: 3600 })
      : json({ access_token: 'g-acesso', refresh_token: 'g-renova', expires_in: 3600 }),
    'oauth2.googleapis.com/revoke': () => json({}),
    'mybusinessaccountmanagement.googleapis.com/v1/accounts': () => json({ accounts: [{ name: 'accounts/1' }] }),
    'mybusinessbusinessinformation.googleapis.com/v1/accounts/1/locations': () => json({
      locations: [{ name: 'locations/9', title: 'Loja Teste', metadata: { mapsUri: 'https://maps.google.com/?cid=9' } }],
    }),
    'mybusiness.googleapis.com/v4/accounts/1/locations/9/reviews': () => json({
      averageRating: 4.64, totalReviewCount: 37,
      reviews: [
        { reviewer: { displayName: 'Maria Aparecida Souza' }, starRating: 'FIVE', comment: 'Atendimento ótimo', createTime: '2026-09-01T10:00:00Z' },
        { reviewer: { displayName: 'Pedro' }, starRating: 'TWO', comment: 'Atrasou', createTime: '2026-09-02T10:00:00Z' },
        { reviewer: { displayName: 'Sem Texto' }, starRating: 'FIVE', comment: '', createTime: '2026-09-03T10:00:00Z' },
        { reviewer: { displayName: 'John Smith' }, starRating: 'FOUR', comment: '(Translated by Google) Good (Original) Muito bom', createTime: '2026-09-04T10:00:00Z' },
        { reviewer: { isAnonymous: true, displayName: 'Fulano Real' }, starRating: 'FIVE', comment: 'Voltarei', createTime: '2026-09-05T10:00:00Z' },
      ],
    }),
    'api.instagram.com/oauth/access_token': () => json({ access_token: 'ig-curto', user_id: 77 }),
    'graph.instagram.com/access_token': () => json({ access_token: 'ig-longo', expires_in: 5184000 }),
    'graph.instagram.com/refresh_access_token': () => json({ access_token: 'ig-renovado', expires_in: 5184000 }),
    'graph.instagram.com/me': () => json({ user_id: '77', username: 'perfil_real' }),
    'graph.instagram.com/me/media': () => json({
      data: [
        { id: 'm1', media_type: 'IMAGE', media_url: 'https://cdn.exemplo.test/m1.jpg', permalink: 'https://instagram.com/p/m1' },
        { id: 'm2', media_type: 'VIDEO', media_url: 'https://cdn.exemplo.test/m2.mp4', thumbnail_url: 'https://cdn.exemplo.test/m2.jpg', permalink: 'https://instagram.com/p/m2' },
      ],
    }),
    'cdn.exemplo.test/m1.jpg': () => new Response(Buffer.from([0xff, 0xd8, 0xff, 1]), { headers: { 'content-type': 'image/jpeg' } }),
    'cdn.exemplo.test/m2.jpg': () => new Response(Buffer.from([0xff, 0xd8, 0xff, 2]), { headers: { 'content-type': 'image/jpeg' } }),
  };
}

before(async () => {
  db = await prepararBanco();
  globalThis.fetch = async (url, opcoes = {}) => {
    const u = new URL(url);
    const chave = u.host + u.pathname;
    chamadas.push({ chave, url: u, opcoes });
    const r = respostas[chave];
    if (!r) throw new Error(`fetch falso sem resposta para ${chave}`);
    return r(new URLSearchParams(opcoes.body || ''), u);
  };
  api = await subirApi();
  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
  });
  ({ dono: dona, ana } = await criarEquipe(api));
});

beforeEach(async () => {
  chamadas = [];
  respostas = respostasPadrao();
  await db.db.comEmpresa('default', async () => {
    await db.db.run('DELETE FROM conexoes');
    await db.setConfig({ avaliacoesGoogle: { nota: null, total: 0, link: '', lista: [] }, instagramPosts: [], instagram: '' });
  });
});

after(async () => {
  globalThis.fetch = fetchDeVerdade;
  for (const url of arquivosCriados) {
    try { fs.unlinkSync(path.join(PASTA_UPLOADS, url.replace(/^\/uploads\//, ''))); } catch { /* já saiu */ }
  }
  await api.fechar();
  await db.pool.end();
});

const VOLTAR = 'http://127.0.0.1/painel.html';

/** Clica em "Conectar" e volta do provedor com um código, como o navegador faria. */
async function conectar(provedor, { mexer } = {}) {
  const r = await dona('POST', `/api/conexoes/${provedor}/iniciar`, { voltar: VOLTAR });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  let estado = new URL(r.corpo.url).searchParams.get('state');
  if (mexer) estado = mexer(estado);
  return api.anonimo()('GET', `/api/oauth/${provedor}/retorno?code=codigo-1&state=${encodeURIComponent(estado)}`);
}

const vitrine = async () => (await api.anonimo()('GET', '/api/publico/vitrine')).corpo;
const linha = provedor => db.db.comEmpresa('default', () =>
  db.db.get('SELECT * FROM conexoes WHERE provedor = ?', provedor));

describe('conexões: quem pode', () => {
  test('funcionária não vê nem conecta', async () => {
    assert.equal((await ana('GET', '/api/conexoes')).status, 403);
    assert.equal((await ana('POST', '/api/conexoes/google/iniciar', { voltar: VOLTAR })).status, 403);
  });

  test('o retorno só volta para o endereço da própria empresa', async () => {
    const r = await dona('POST', '/api/conexoes/google/iniciar', { voltar: 'https://golpe.example/painel' });
    assert.equal(r.status, 400);
  });

  test('a URL de autorização pede só o necessário e devolve para o endereço cadastrado', async () => {
    const r = await dona('POST', '/api/conexoes/google/iniciar', { voltar: VOLTAR });
    const u = new URL(r.corpo.url);
    assert.equal(u.searchParams.get('redirect_uri'), 'https://api.exemplo.test/api/oauth/google/retorno');
    assert.equal(u.searchParams.get('scope'), 'https://www.googleapis.com/auth/business.manage');
    assert.equal(u.searchParams.get('access_type'), 'offline');
    const ig = await dona('POST', '/api/conexoes/instagram/iniciar', { voltar: VOLTAR });
    assert.equal(new URL(ig.corpo.url).searchParams.get('scope'), 'instagram_business_basic');
  });
});

describe('conexão com o Google', () => {
  test('conecta, sincroniza e o site mostra as avaliações', async () => {
    const r = await conectar('google');
    assert.equal(r.status, 302);
    const volta = new URL(r.cabecalhos.location);
    assert.equal(volta.origin + volta.pathname, VOLTAR);
    assert.equal(volta.searchParams.get('resultado'), 'ok');

    const { avaliacoes } = await vitrine();
    assert.equal(avaliacoes.nota, 4.6, 'nota arredondada em uma casa');
    assert.equal(avaliacoes.total, 37, 'o total conta todas, não só as exibidas');
    assert.equal(avaliacoes.link, 'https://maps.google.com/?cid=9');
    assert.deepEqual(avaliacoes.lista.map(a => a.autor), ['Maria S.', 'John S.', 'Cliente do Google'],
      'só 4 e 5 estrelas com texto; nome abreviado; anônimo continua anônimo');
    assert.equal(avaliacoes.lista[1].texto, 'Muito bom', 'vale o texto original, não a tradução');
    assert.deepEqual(Object.keys(avaliacoes.lista[0]).sort(), ['autor', 'data', 'nota', 'texto']);
  });

  test('token nenhum sai por rota nenhuma, e no banco ele está cifrado', async () => {
    await conectar('google');
    const tudo = JSON.stringify([
      (await dona('GET', '/api/config')).corpo,
      (await dona('GET', '/api/conexoes')).corpo,
      (await dona('GET', '/api/estado')).corpo,
      await vitrine(),
    ]);
    assert.ok(!tudo.includes('g-acesso') && !tudo.includes('g-renova'), 'token apareceu numa resposta');

    const l = await linha('google');
    assert.notEqual(l.token_acesso, 'g-acesso');
    assert.ok(!l.token_acesso.includes('g-acesso'));
    assert.equal(l.situacao, 'ok');
  });

  test('state mexido não grava nada', async () => {
    const r = await conectar('google', {
      mexer: estado => {
        const [corpo, assinatura] = estado.split('.');
        const dados = JSON.parse(Buffer.from(corpo, 'base64url').toString());
        dados.t = 'outra-empresa';
        return `${Buffer.from(JSON.stringify(dados)).toString('base64url')}.${assinatura}`;
      },
    });
    assert.equal(r.status, 400);
    assert.equal(await linha('google'), undefined);
    assert.ok(!chamadas.some(c => c.chave === 'oauth2.googleapis.com/token'), 'nem chegou a trocar o código');
  });

  test('quem recusa na tela do Google volta sem conexão', async () => {
    const r = await dona('POST', '/api/conexoes/google/iniciar', { voltar: VOLTAR });
    const estado = new URL(r.corpo.url).searchParams.get('state');
    const volta = await api.anonimo()('GET', `/api/oauth/google/retorno?error=access_denied&state=${encodeURIComponent(estado)}`);
    assert.equal(new URL(volta.cabecalhos.location).searchParams.get('resultado'), 'cancelado');
    assert.equal(await linha('google'), undefined);
  });

  test('avaliação não se escreve pela config', async () => {
    await dona('PUT', '/api/config', {
      avaliacoesGoogle: { nota: 5, total: 999, lista: [{ autor: 'Eu mesma', nota: 5, texto: 'Perfeito' }] },
    });
    assert.equal((await vitrine()).avaliacoes, null);
  });

  test('token vencido é renovado antes de buscar', async () => {
    await conectar('google');
    await db.db.comEmpresa('default', () =>
      db.db.run(`UPDATE conexoes SET expira_em = now() - interval '1 minute' WHERE provedor = 'google'`));
    chamadas = [];
    assert.equal((await dona('POST', '/api/conexoes/google/sincronizar')).status, 200);
    const renovou = chamadas.find(c => c.chave === 'oauth2.googleapis.com/token');
    assert.equal(new URLSearchParams(renovou.opcoes.body).get('grant_type'), 'refresh_token');
    const busca = chamadas.find(c => c.chave.endsWith('/reviews'));
    assert.equal(busca.opcoes.headers.Authorization, 'Bearer g-acesso-renovado');
  });

  test('autorização revogada vira "conecte de novo", sem derrubar nada', async () => {
    await conectar('google');
    await db.db.comEmpresa('default', () =>
      db.db.run(`UPDATE conexoes SET expira_em = now() - interval '1 minute' WHERE provedor = 'google'`));
    respostas['oauth2.googleapis.com/token'] = () => json({ error: 'invalid_grant' }, 400);
    assert.equal((await dona('POST', '/api/conexoes/google/sincronizar')).status, 502);
    const [g] = (await dona('GET', '/api/conexoes')).corpo.filter(c => c.provedor === 'google');
    assert.equal(g.situacao, 'erro');
    assert.match(g.erro, /Conecte de novo/);
    assert.equal((await vitrine()).avaliacoes.total, 37, 'o site continua com o que já tinha');
  });

  test('várias fichas: a dona escolhe antes de aparecer no site', async () => {
    respostas['mybusinessbusinessinformation.googleapis.com/v1/accounts/1/locations'] = () => json({
      locations: [
        { name: 'locations/9', title: 'Loja Centro', metadata: { mapsUri: 'https://maps.google.com/?cid=9' } },
        { name: 'locations/8', title: 'Loja Norte' },
      ],
    });
    const r = await conectar('google');
    assert.equal(new URL(r.cabecalhos.location).searchParams.get('resultado'), 'escolher');
    assert.equal((await vitrine()).avaliacoes, null);

    const recusa = await dona('PUT', '/api/conexoes/google/ficha', { ficha: 'accounts/2/locations/1' });
    assert.equal(recusa.status, 400, 'ficha de fora da conta não serve');

    await dona('PUT', '/api/conexoes/google/ficha', { ficha: 'accounts/1/locations/9' });
    const [g] = (await dona('GET', '/api/conexoes')).corpo.filter(c => c.provedor === 'google');
    assert.equal(g.conta, 'Loja Centro');
    assert.equal((await vitrine()).avaliacoes.total, 37);
  });

  test('desconectar tira as avaliações do site', async () => {
    await conectar('google');
    assert.equal((await dona('DELETE', '/api/conexoes/google')).status, 200);
    assert.equal(await linha('google'), undefined);
    assert.equal((await vitrine()).avaliacoes, null);
    assert.ok(chamadas.some(c => c.chave === 'oauth2.googleapis.com/revoke'));
  });
});

describe('conexão com o Instagram', () => {
  test('conecta e a grade mostra as publicações, com a foto guardada aqui', async () => {
    const r = await conectar('instagram');
    assert.equal(new URL(r.cabecalhos.location).searchParams.get('resultado'), 'ok');

    const v = await vitrine();
    assert.equal(v.negocio.instagram, 'perfil_real', 'o perfil passa a ser o da conta conectada');
    assert.equal(v.instagramPosts.length, 2);
    assert.equal(v.instagramPosts[0].link, 'https://instagram.com/p/m1');
    assert.equal(v.instagramPosts[1].tipo, 'video');
    for (const p of v.instagramPosts) {
      assert.match(p.imagem, /^\/uploads\/default\/instagram-/, 'a grade nunca aponta para o CDN da Meta');
      arquivosCriados.add(p.imagem);
    }
    assert.ok(chamadas.some(c => c.chave === 'graph.instagram.com/access_token'
      && c.url.searchParams.get('grant_type') === 'ig_exchange_token'), 'trocou pelo token de 60 dias');
  });

  test('sincronizar de novo não baixa outra vez a mesma foto', async () => {
    await conectar('instagram');
    for (const p of (await vitrine()).instagramPosts) arquivosCriados.add(p.imagem);
    chamadas = [];
    await dona('POST', '/api/conexoes/instagram/sincronizar');
    assert.ok(!chamadas.some(c => c.chave.startsWith('cdn.exemplo.test')));
  });

  test('conectado, a tela não sobrescreve a grade com o que tinha aberto', async () => {
    await conectar('instagram');
    const antes = (await vitrine()).instagramPosts;
    antes.forEach(p => arquivosCriados.add(p.imagem));
    await dona('PUT', '/api/config', { instagramPosts: [{ imagem: '/uploads/default/velha.jpg' }], instagram: 'outro' });
    const v = await vitrine();
    assert.deepEqual(v.instagramPosts, antes);
    assert.equal(v.negocio.instagram, 'perfil_real');
  });

  test('aviso da Meta sem assinatura válida não apaga nada', async () => {
    await conectar('instagram');
    (await vitrine()).instagramPosts.forEach(p => arquivosCriados.add(p.imagem));
    const corpo = Buffer.from(JSON.stringify({ user_id: '77' })).toString('base64url');
    const r = await api.anonimo()('POST', '/api/oauth/instagram/desautorizar', undefined);
    assert.equal(r.status, 400);
    const falsa = await enviarFormulario('/api/oauth/instagram/desautorizar', `signed_request=xxx.${corpo}`);
    assert.equal(falsa, 400);
    assert.ok(await linha('instagram'), 'a conexão continua');
  });

  test('aviso da Meta assinado apaga a conexão e as publicações', async () => {
    await conectar('instagram');
    (await vitrine()).instagramPosts.forEach(p => arquivosCriados.add(p.imagem));
    const crypto = await import('node:crypto');
    const corpo = Buffer.from(JSON.stringify({ user_id: '77', algorithm: 'HMAC-SHA256' })).toString('base64url');
    const sig = crypto.createHmac('sha256', 'ig-segredo').update(corpo).digest('base64url');
    assert.equal(await enviarFormulario('/api/oauth/instagram/apagar-dados', `signed_request=${sig}.${corpo}`), 200);
    assert.equal(await linha('instagram'), undefined);
    assert.deepEqual((await vitrine()).instagramPosts, []);
  });
});

/** POST de formulário, como a Meta manda. Devolve o status. */
async function enviarFormulario(caminho, corpo) {
  const r = await fetchDeVerdade(api.base + caminho, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: corpo,
  });
  return r.status;
}
