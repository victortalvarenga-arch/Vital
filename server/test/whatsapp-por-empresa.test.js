import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  prepararBanco, limpar, limparAgenda, cenario, subirApi, criarEquipe, criarEmpresa, apagarEmpresa, comoAdmin,
} from './ambiente.js';

/**
 * Cada empresa com o próprio número de WhatsApp (migration 035).
 *
 * A Meta é trocada por um `fetch` falso; todo o resto é de verdade. O que mais
 * importa provar: a mensagem de uma empresa nunca sai pelo número da outra; o
 * token não sai por rota nenhuma; e a empresa sem número continua no modo
 * manual, sem depender de nada do servidor.
 */

process.env.CONEXOES_SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres!!';

const OUTRA = 'wz-outra';
const NUMERO = '1000000001', TOKEN = 'token-da-default';
let db, api, dona, ana, despachar, gravarConexao, whatsapp, chamadas, respostaDoEnvio;
const fetchDeVerdade = globalThis.fetch;

const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), {
  status, headers: { 'content-type': 'application/json' },
});

before(async () => {
  db = await prepararBanco();
  globalThis.fetch = async (url, opcoes = {}) => {
    const u = new URL(url);
    chamadas.push({ url: u, token: opcoes.headers?.Authorization, corpo: opcoes.body });
    if (u.pathname.endsWith('/messages')) return respostaDoEnvio();
    if (opcoes.headers?.Authorization === 'Bearer token-errado') {
      return json({ error: { message: 'Invalid OAuth access token', code: 190 } }, 401);
    }
    return json({ verified_name: 'Empresa Teste', display_phone_number: '+55 47 3333-0000' });
  };
  api = await subirApi();
  ({ despachar } = await import('../src/jobs/mensagens.js'));
  ({ gravarConexao } = await import('../src/conexoes/index.js'));
  ({ whatsapp } = await import('../src/conexoes/whatsapp.js'));

  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
    await db.db.run(`DELETE FROM conexoes`);
    await db.db.run(
      `INSERT INTO templates (id,chave,titulo,tipo,texto) VALUES ('t-volta','reativacao','Saudade','recuperacao','Oi {cliente}')`);
  });
  await criarEmpresa(db, { id: OUTRA, slug: OUTRA, nome: 'Outra' });
  await db.db.comEmpresa(OUTRA, () => cenario(db, { prefixo: 'wz-' }));
  ({ dono: dona, ana } = await criarEquipe(api));
});

after(async () => {
  globalThis.fetch = fetchDeVerdade;
  await apagarEmpresa(OUTRA);
  await comoAdmin(`DELETE FROM conexoes WHERE provedor = 'whatsapp'`);
  await api.fechar();
  await db.pool.end();
});

beforeEach(async () => {
  chamadas = [];
  respostaDoEnvio = () => json({ messages: [{ id: 'wamid.1' }] });
  await comoAdmin(`DELETE FROM conexoes WHERE provedor = 'whatsapp'`);
  await db.db.comEmpresa('default', () => limparAgenda(db));
  await db.db.comEmpresa(OUTRA, () => limparAgenda(db));
});

const naFila = (empresa, cliente, expira = null) => db.db.comEmpresa(empresa, async () => {
  const id = 'm' + Math.random().toString(36).slice(2, 10);
  await db.db.run(
    `INSERT INTO messages (id, client_id, template_chave, fone, texto, agendado_para, expira_em, criado_em)
     VALUES (?, ?, 'confirmacao', '47900000001', 'oi', '2020-01-01 10:00', ?, '2020-01-01')`, id, cliente, expira);
  return id;
});

const statusDa = (empresa, id) => db.db.comEmpresa(empresa, () =>
  db.db.get('SELECT status, provider, provider_id, erro FROM messages WHERE id = ?', id));

const conectarDireto = (empresa, phoneId, token) => db.db.comEmpresa(empresa, async () =>
  gravarConexao('whatsapp', await whatsapp.conectar({ phoneId, token })));

const conectar = (corpo = { phoneId: NUMERO, token: TOKEN }) => dona('PUT', '/api/conexoes/whatsapp', corpo);
const situacao = async () => (await dona('GET', '/api/conexoes')).corpo.find(c => c.provedor === 'whatsapp');

describe('sem número conectado', () => {
  test('a empresa fica no modo manual, e nada vai para a Meta', async () => {
    const id = await naFila('default', 'c1');
    assert.equal((await dona('GET', '/api/mensagens/fila')).corpo.modoManual, true);

    const r = await db.db.comEmpresa('default', () => despachar());
    assert.equal(r.modo, 'manual');
    assert.equal(chamadas.length, 0);
    assert.equal((await statusDa('default', id)).status, 'pendente', 'continua na fila, para o link');
  });
});

describe('conectar o número', () => {
  test('confere com a Meta e guarda o token cifrado', async () => {
    const r = await conectar();
    assert.equal(r.status, 200);
    assert.match(r.corpo.conta, /Empresa Teste/);
    assert.equal(chamadas[0].url.pathname.endsWith(`/${NUMERO}`), true);

    const linha = await db.db.comEmpresa('default', () =>
      db.db.get(`SELECT token_acesso, extra FROM conexoes WHERE provedor = 'whatsapp'`));
    assert.ok(!linha.token_acesso.includes(TOKEN), 'um dump do banco não pode abrir a conta');
    assert.equal(linha.extra.phoneId, NUMERO);
    assert.equal((await dona('GET', '/api/mensagens/fila')).corpo.modoManual, false);
  });

  test('o token não volta por rota nenhuma nem vai para o registro', async () => {
    await conectar();
    assert.ok(!JSON.stringify(await situacao()).includes(TOKEN));
    const logs = await db.db.comEmpresa('default', () =>
      db.db.all(`SELECT resumo, detalhe FROM logs WHERE alvo_id = 'whatsapp'`));
    assert.ok(logs.length > 0, 'quem conectou fica registrado');
    assert.ok(!JSON.stringify(logs).includes(TOKEN));
  });

  test('token recusado pela Meta não grava nada', async () => {
    const r = await conectar({ phoneId: NUMERO, token: 'token-errado' });
    assert.equal(r.status, 400);
    assert.match(r.corpo.erro, /Meta recusou/);
    assert.equal((await situacao()).conectado, false);
  });

  test('id que não é número nem chega à Meta', async () => {
    const r = await conectar({ phoneId: '../../me', token: TOKEN });
    assert.equal(r.status, 400);
    assert.equal(r.corpo.campo, 'phoneId');
    assert.equal(chamadas.length, 0);
  });

  test('só quem configura a empresa conecta', async () => {
    const r = await ana('PUT', '/api/conexoes/whatsapp', { phoneId: NUMERO, token: TOKEN });
    assert.equal(r.status, 403);
  });

  test('não há tela de autorização para iniciar', async () => {
    const r = await dona('POST', '/api/conexoes/whatsapp/iniciar', { voltar: 'http://127.0.0.1/' });
    assert.equal(r.status, 404);
  });
});

describe('cada empresa no próprio número', () => {
  test('duas empresas conectadas enviam cada uma pelo seu', async () => {
    await conectarDireto('default', NUMERO, TOKEN);
    await conectarDireto(OUTRA, '2000000002', 'token-da-outra');
    await naFila('default', 'c1');
    await naFila(OUTRA, 'wz-c1');
    chamadas = [];

    await db.db.comEmpresa('default', () => despachar());
    assert.equal(chamadas.length, 1);
    assert.ok(chamadas[0].url.pathname.includes(`/${NUMERO}/messages`));
    assert.equal(chamadas[0].token, `Bearer ${TOKEN}`);

    chamadas = [];
    await db.db.comEmpresa(OUTRA, () => despachar());
    assert.ok(chamadas[0].url.pathname.includes('/2000000002/messages'));
    assert.equal(chamadas[0].token, 'Bearer token-da-outra');
  });

  test('a empresa sem número não herda o da outra', async () => {
    await conectarDireto('default', NUMERO, TOKEN);
    const id = await naFila(OUTRA, 'wz-c1');
    chamadas = [];

    const r = await db.db.comEmpresa(OUTRA, () => despachar());
    assert.equal(r.modo, 'manual');
    assert.equal(chamadas.length, 0);
    assert.equal((await statusDa(OUTRA, id)).status, 'pendente');
  });

  test('o botão Enviar da fila sai pela API e guarda o id da Meta', async () => {
    await conectarDireto('default', NUMERO, TOKEN);
    const id = await naFila('default', 'c1');
    const r = await dona('POST', `/api/mensagens/fila/${id}/enviar`);
    assert.equal(r.status, 200);
    assert.equal(r.corpo.manual, undefined, 'sem link: a tela não pode abrir o WhatsApp também');
    const m = await statusDa('default', id);
    assert.deepEqual([m.status, m.provider, m.provider_id], ['enviado', 'meta', 'wamid.1']);
  });
});

describe('o envio automático', () => {
  test('não entrega o que passou do prazo, mesmo que o cron tenha ficado fora', async () => {
    // O pior caso da fila: o servidor volta depois de uma queda e despacha
    // "seu horário é hoje às 14h" para quem já foi atendida.
    await conectarDireto('default', NUMERO, TOKEN);
    const vencida = await naFila('default', 'c1', '2020-01-01 11:00');
    const noPrazo = await naFila('default', 'c1', '2999-01-01 11:00');

    await db.db.comEmpresa('default', () => despachar());
    assert.equal((await statusDa('default', vencida)).status, 'expirado');
    assert.equal((await statusDa('default', noPrazo)).status, 'enviado');
    assert.equal(chamadas.filter(c => c.url.pathname.endsWith('/messages')).length, 1);
  });

  test('a Recuperação envia pelo número da empresa, uma vez por dia', async () => {
    await conectarDireto('default', NUMERO, TOKEN);
    await db.db.comEmpresa('default', () => db.db.run(`UPDATE clients SET optin = 1 WHERE id = 'c1'`));

    const envios = () => chamadas.filter(c => c.url.pathname.endsWith('/messages')).length;
    assert.equal((await dona('POST', '/api/mensagens/recuperacao/c1/enviar')).status, 200);
    assert.equal(envios(), 1);
    assert.equal((await dona('POST', '/api/mensagens/recuperacao/c1/enviar')).status, 409);
    assert.equal(envios(), 1, 'o segundo toque não vira outra mensagem');
  });

  test('falha da Meta na Recuperação não conta como enviada', async () => {
    await conectarDireto('default', NUMERO, TOKEN);
    await db.db.comEmpresa('default', () => db.db.run(`UPDATE clients SET optin = 1 WHERE id = 'c1'`));
    respostaDoEnvio = () => json({ error: { message: 'fora da janela', code: 131047 } }, 400);

    assert.equal((await dona('POST', '/api/mensagens/recuperacao/c1/enviar')).status, 502);
    const salvas = await db.db.comEmpresa('default', () =>
      db.db.all(`SELECT id FROM messages WHERE template_chave = 'reativacao'`));
    assert.deepEqual(salvas, [], 'sem linha, dá para tentar de novo no mesmo dia');
  });
});

describe('quando a conexão cai', () => {
  test('token morto no envio devolve a empresa ao modo manual', async () => {
    await conectarDireto('default', NUMERO, TOKEN);
    const id = await naFila('default', 'c1');
    respostaDoEnvio = () => json({ error: { message: 'Session expired', code: 190 } }, 401);

    await db.db.comEmpresa('default', () => despachar());
    assert.equal((await statusDa('default', id)).status, 'erro');

    const s = await situacao();
    assert.equal(s.situacao, 'erro');
    assert.match(s.erro, /Conecte o número de novo/);
    assert.equal((await dona('GET', '/api/mensagens/fila')).corpo.modoManual, true);
  });

  test('erro de uma mensagem só não derruba a conexão', async () => {
    await conectarDireto('default', NUMERO, TOKEN);
    await naFila('default', 'c1');
    respostaDoEnvio = () => json({ error: { message: 'Fora da janela de 24h', code: 131047 } }, 400);

    await db.db.comEmpresa('default', () => despachar());
    assert.equal((await situacao()).situacao, 'ok');
  });

  test('o job de hora em hora nota o token revogado', async () => {
    await conectarDireto('default', NUMERO, TOKEN);
    const { cifrar } = await import('../src/lib/segredo.js');
    await db.db.comEmpresa('default', () => db.db.run(
      `UPDATE conexoes SET token_acesso = ? WHERE provedor = 'whatsapp'`, cifrar('token-errado')));

    const r = await dona('POST', '/api/conexoes/whatsapp/sincronizar');
    assert.equal(r.status, 502);
    assert.equal((await situacao()).situacao, 'erro');
  });

  test('desconectar volta ao modo manual', async () => {
    await conectar();
    assert.equal((await dona('DELETE', '/api/conexoes/whatsapp')).status, 200);
    assert.equal((await situacao()).conectado, false);
    assert.equal((await dona('GET', '/api/mensagens/fila')).corpo.modoManual, true);
  });
});
