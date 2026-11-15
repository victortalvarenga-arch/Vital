import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { prepararBanco, limpar, limparAgenda, cenario, subirApi, criarEmpresa, apagarEmpresa } from './ambiente.js';

/**
 * "Entrar com Google" no site — o caminho inteiro, pelas rotas.
 *
 * O login é **opção, nunca exigência**: agendar só com o WhatsApp continua
 * funcionando ao lado, e o último caso deste arquivo existe para provar isso.
 *
 * O que ele resolve: quem volta não digita nada. O que ele NÃO resolve: o
 * telefone. O Google não devolve número, e o número é a identidade da ficha —
 * então cliente nova com Google digita o WhatsApp do mesmo jeito.
 *
 * **O caso difícil é o terceiro.** A pessoa entra com a conta dela e digita um
 * telefone que já tem ficha sem Google. Ligar a conta à ficha ali seria
 * entregar a ficha de outra pessoa a quem errou um dígito — com histórico,
 * endereço e observações dentro. Então o agendamento acontece (é o mesmo
 * comportamento de sempre, com telefone) e o vínculo fica **pedido**, para a
 * profissional confirmar no painel.
 */

const CLIENTE_OAUTH = '123456789-vital.apps.googleusercontent.com';
const KID = 'k1';
const CERTS = 'www.googleapis.com/oauth2/v3/certs';
const VIZINHA = 'vizinha-login';
const DIA = '2027-05-10';

const fetchDeVerdade = globalThis.fetch;
let db, api, par, jwk, google;

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');

/** Um ID token do Google, assinado com a chave que o `fetch` falso publica. */
function idToken({ sub = '110000000000000000001', email = 'teresa@gmail.com', nome = 'Teresa Bianchi' } = {}) {
  const agora = Math.floor(Date.now() / 1000);
  const inicio = `${b64({ alg: 'RS256', kid: KID, typ: 'JWT' })}.${b64({
    iss: 'https://accounts.google.com', aud: CLIENTE_OAUTH, sub, email,
    email_verified: true, name: nome, iat: agora - 10, exp: agora + 3600,
  })}`;
  return `${inicio}.${crypto.sign('RSA-SHA256', Buffer.from(inicio), par.privateKey).toString('base64url')}`;
}

before(async () => {
  process.env.GOOGLE_LOGIN_CLIENT_ID = CLIENTE_OAUTH;
  par = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  jwk = { ...par.publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };

  db = await prepararBanco();
  api = await subirApi();
  google = await import('../src/lib/google-login.js');

  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
  });
  await criarEmpresa(db, {
    id: VIZINHA, slug: 'vizinha-login', nome: 'Vizinha', dominio: 'vizinha-login.teste',
  });
});

after(async () => {
  globalThis.fetch = fetchDeVerdade;
  delete process.env.GOOGLE_LOGIN_CLIENT_ID;
  await apagarEmpresa(VIZINHA);
  const { esquecerCacheDeEmpresas } = await import('../src/lib/tenant.js');
  esquecerCacheDeEmpresas();
  await api?.fechar();
  await db?.pool.end();
});

beforeEach(async () => {
  google.esquecerChaves();
  globalThis.fetch = async url => {
    if (new URL(url).host + new URL(url).pathname !== CERTS) throw new Error(`fetch falso: ${url}`);
    return new Response(JSON.stringify({ keys: [jwk] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  await db.db.comEmpresa('default', async () => {
    await limparAgenda(db);
    await db.db.run(`DELETE FROM clients WHERE fone <> '47900000001'`);
    await db.db.run(`UPDATE clients SET google_sub = NULL, google_sub_pendente = NULL,
                     email_pendente = '', vinculo_pedido_em = NULL`);
  });
});

const entrar = (token, host) => (host ? api.noHost(host) : api.anonimo())(
  'POST', '/api/publico/google', { token });

const agendar = corpo => api.anonimo()('POST', '/api/publico/agendar', {
  servicoId: 's1', profissionalId: 'p1', data: DIA, hora: '10:00', ...corpo,
});

const ficha = fone => db.db.comEmpresa('default', () =>
  db.db.get('SELECT * FROM clients WHERE fone = ?', fone));

const comSub = sub => db.db.comEmpresa('default', () =>
  db.db.get('SELECT * FROM clients WHERE google_sub = ?', sub));

/** Cria uma ficha como o painel criaria, com ou sem conta ligada. */
const fichaAntiga = (id, nome, fone, sub = null) => db.db.comEmpresa('default', () => db.db.run(
  `INSERT INTO clients (id,nome,fone,google_sub,criado_em) VALUES (?,?,?,?,'2026-01-01')`,
  id, nome, fone, sub
));

describe('POST /publico/google — quem é esta conta aqui dentro', () => {
  test('conta vinculada: devolve o primeiro nome e nada mais', async () => {
    await fichaAntiga('lg1', 'Teresa Bianchi', '47988883001', '110000000000000000001');
    const r = await entrar(idToken());
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    // `deepEqual` no corpo inteiro: campo novo aqui é vazamento novo, como no
    // `/identificar`. A diferença é que aqui o nome só sai para quem PROVOU
    // ser dona da conta — um token assinado não se digita a esmo.
    assert.deepEqual(r.corpo, { conhecida: true, primeiroNome: 'Teresa' });
  });

  test('conta desconhecida: devolve o que o Google disse, para pré-preencher', async () => {
    const r = await entrar(idToken());
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.deepEqual(r.corpo, { conhecida: false, nome: 'Teresa Bianchi', email: 'teresa@gmail.com' });
  });

  test('token inválido: 401, e nada do Google é aproveitado', async () => {
    const r = await entrar(idToken().slice(0, -4) + 'aaaa');
    assert.equal(r.status, 401, JSON.stringify(r.corpo));
  });

  test('vínculo de outra empresa não vale nesta', async () => {
    await fichaAntiga('lg2', 'Teresa Bianchi', '47988883002', '110000000000000000001');
    const r = await entrar(idToken(), 'vizinha-login.teste');
    assert.deepEqual(r.corpo, { conhecida: false, nome: 'Teresa Bianchi', email: 'teresa@gmail.com' });
  });
});

describe('agendar entrando com o Google', () => {
  test('quem já tem conta ligada agenda sem digitar telefone nenhum', async () => {
    await fichaAntiga('lg3', 'Teresa Bianchi', '47988883003', '110000000000000000001');
    const r = await agendar({ googleToken: idToken() });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.cliente.primeiroNome, 'Teresa');
    const dela = await ficha('47988883003');
    assert.ok(await db.db.comEmpresa('default', () =>
      db.db.get('SELECT 1 FROM appointments WHERE client_id = ?', dela.id)));
  });

  test('número novo: a ficha nasce já com a conta e o e-mail', async () => {
    const r = await agendar({
      googleToken: idToken(), fone: '47988883004', nome: 'Teresa Bianchi',
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    const nova = await ficha('47988883004');
    assert.equal(nova.google_sub, '110000000000000000001');
    assert.equal(nova.email, 'teresa@gmail.com');
  });

  test('número de ficha que já existe: agenda, mas o vínculo fica PEDIDO', async () => {
    // O caso difícil: pode ser ela mesma, pode ser quem errou um dígito. O
    // agendamento acontece como sempre aconteceu; a conta não encosta na ficha.
    await fichaAntiga('lg4', 'Dona Antiga', '47988883005');
    const r = await agendar({ googleToken: idToken(), fone: '47988883005' });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const dela = await ficha('47988883005');
    assert.equal(dela.google_sub, null, 'vinculou sem ninguém confirmar');
    assert.equal(dela.google_sub_pendente, '110000000000000000001');
    assert.equal(dela.email_pendente, 'teresa@gmail.com');
    assert.match(dela.vinculo_pedido_em, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(dela.nome, 'Dona Antiga', 'reescreveu o nome da ficha alheia');
  });

  test('ficha que já tem OUTRA conta ligada: agenda e não mexe em nada', async () => {
    await fichaAntiga('lg5', 'Outra Pessoa', '47988883006', '990000000000000000009');
    const r = await agendar({ googleToken: idToken(), fone: '47988883006' });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));

    const dela = await ficha('47988883006');
    assert.equal(dela.google_sub, '990000000000000000009', 'trocou a conta ligada');
    assert.equal(dela.google_sub_pendente, null, 'virou pedido numa ficha já ligada a outra conta');

    const registro = await db.db.comEmpresa('default', () =>
      db.db.get(`SELECT * FROM logs WHERE acao = 'vinculo.conflito'`));
    assert.ok(registro, 'o conflito não ficou registrado');
  });

  test('token inválido no agendamento: 401 e horário nenhum ocupado', async () => {
    const r = await agendar({ googleToken: 'nao.e.token', fone: '47988883007', nome: 'Alguém' });
    assert.equal(r.status, 401, JSON.stringify(r.corpo));
    assert.equal(await ficha('47988883007'), undefined);
  });

  test('o caminho só com WhatsApp continua igual, sem Google nenhum', async () => {
    // O login é opção. Se este caso cair, o produto parou de atender quem não
    // tem conta Google — ou quem não quer usá-la.
    const r = await agendar({ fone: '47988883008', nome: 'Sem Google' });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    const nova = await ficha('47988883008');
    assert.equal(nova.google_sub, null);
    assert.equal(nova.email, '');
  });

  test('conta ligada numa empresa não agenda na outra', async () => {
    await fichaAntiga('lg6', 'Teresa Bianchi', '47988883009', '110000000000000000001');
    // Na vizinha, a mesma conta é desconhecida: sem telefone, não há ficha.
    const r = await api.noHost('vizinha-login.teste')('POST', '/api/publico/agendar', {
      googleToken: idToken(), servicoId: 's1', profissionalId: 'p1', data: DIA, hora: '10:00',
    });
    assert.notEqual(r.status, 201, `agendou na vizinha: ${JSON.stringify(r.corpo)}`);
    assert.equal(await comSub('990000000000000000009'), undefined);
  });
});
