import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, cenario, subirApi, criarEquipe, SENHA } from './ambiente.js';

/**
 * "Esqueci minha senha".
 *
 * O e-mail sai pelo modo `console` (o padrão fora de produção), e o teste lê o
 * link de lá — é o mesmo texto que chegaria na caixa de entrada.
 */

let db, api, dona;
const impressos = [];
const logOriginal = console.log;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
  });
  ({ dono: dona } = await criarEquipe(api));
  console.log = (...a) => { impressos.push(a.join(' ')); };
});

after(async () => {
  console.log = logOriginal;
  await api.fechar();
  await db.pool.end();
});

beforeEach(() => { impressos.length = 0; });

/** Pede o link e devolve o token que foi no e-mail. */
async function pedirLink(email) {
  impressos.length = 0;
  const r = await api.anonimo()('POST', '/api/auth/esqueci', { email });
  assert.equal(r.status, 200);
  // O envio não é esperado pela rota; dá um respiro para ele imprimir.
  await new Promise(ok => setTimeout(ok, 50));
  const m = impressos.join('\n').match(/#redefinir=([\w-]+)/);
  return { resposta: r.corpo, token: m?.[1] };
}

describe('esqueci minha senha', () => {
  test('a resposta é a mesma exista o e-mail ou não', async () => {
    const existe = await pedirLink('dona@teste.com');
    const naoExiste = await pedirLink('ninguem@teste.com');
    assert.deepEqual(existe.resposta, naoExiste.resposta);
    assert.ok(existe.token, 'quem tem conta recebe o link');
    assert.equal(naoExiste.token, undefined, 'quem não tem não recebe nada');
  });

  test('o link troca a senha, uma vez só, e derruba as sessões abertas', async () => {
    const { token } = await pedirLink('dona@teste.com');
    const nova = 'senha-nova-5678';

    assert.equal((await api.anonimo()('POST', '/api/auth/redefinir', { token, senha: 'curta' })).status, 400);
    assert.equal((await api.anonimo()('POST', '/api/auth/redefinir', { token, senha: nova })).status, 200);
    assert.equal((await api.anonimo()('POST', '/api/auth/redefinir', { token, senha: nova })).status, 400,
      'o mesmo link não vale duas vezes');

    assert.equal((await dona('GET', '/api/auth/eu')).status, 401, 'a sessão que estava aberta caiu');
    assert.equal((await api.anonimo()('POST', '/api/auth/login', { email: 'dona@teste.com', senha: SENHA })).status, 401);
    dona = await api.entrar('dona@teste.com', nova);

    // Devolve a senha da suíte para os próximos testes.
    const volta = await pedirLink('dona@teste.com');
    await api.anonimo()('POST', '/api/auth/redefinir', { token: volta.token, senha: SENHA });
    dona = await api.entrar('dona@teste.com', SENHA);
  });

  test('link vencido não serve, e pedir de novo invalida o anterior', async () => {
    const primeiro = await pedirLink('dona@teste.com');
    const segundo = await pedirLink('dona@teste.com');
    assert.equal((await api.anonimo()('POST', '/api/auth/redefinir', { token: primeiro.token, senha: 'outra-senha-123' })).status, 400);

    await db.db.comEmpresa('default', () =>
      db.db.run(`UPDATE redefinicoes_senha SET expira_em = now() - interval '1 minute'`));
    assert.equal((await api.anonimo()('POST', '/api/auth/redefinir', { token: segundo.token, senha: 'outra-senha-123' })).status, 400);
  });

  test('o token não fica no banco, só o hash', async () => {
    const { token } = await pedirLink('dona@teste.com');
    const linhas = await db.db.comEmpresa('default', () => db.db.all('SELECT token_hash FROM redefinicoes_senha'));
    assert.ok(linhas.length > 0);
    assert.ok(linhas.every(l => l.token_hash !== token));
  });
});
