import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { prepararBanco, limpar, cenario } from './ambiente.js';

/**
 * A requisição como transação (`db.naRequisicao`).
 *
 * Um app mínimo, montado aqui, com o mesmo middleware de empresa do app de
 * verdade e rotas feitas para quebrar no lugar certo: é o jeito de provar o
 * mecanismo sem depender de uma rota real que por acaso falhe no meio.
 */

let db, tenant, rota, servidor, porta;

before(async () => {
  db = await prepararBanco();
  tenant = await import('../src/lib/tenant.js');
  ({ rota } = await import('../src/lib/rota.js'));
  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
  });

  const app = express();
  app.use(express.json());
  app.use(tenant.comEmpresa(db.db));
  const inserir = nome => db.db.run(
    `INSERT INTO clients (id, nome, fone, criado_em) VALUES (?, ?, ?, '2026-01-01')`,
    'x-' + nome, nome, '4790000' + String(Math.random()).slice(2, 6));

  // Grava e quebra: nada pode ficar.
  app.post('/quebra', rota(async () => {
    await inserir('Quebrou');
    throw new Error('de propósito');
  }));
  // Um erro engolido com `opcional` não estraga o resto.
  app.post('/opcional', rota(async (req, res) => {
    try { await db.db.opcional(() => db.db.run('SELECT * FROM tabela_que_nao_existe')); } catch { /* engolido */ }
    await inserir('DepoisDoOpcional');
    res.json({ ok: true });
  }));
  // Erro engolido SEM `opcional`: a transação morre, e a resposta tem de ser
  // 500 — sucesso na tela com nada gravado é o pior dos erros.
  app.post('/envenenada', rota(async (req, res) => {
    try { await db.db.run('SELECT * FROM tabela_que_nao_existe'); } catch { /* engolido sem cuidado */ }
    try { await inserir('Envenenada'); } catch { /* idem */ }
    res.json({ ok: true });
  }));
  // Transação dentro da requisição vira ponto de retorno.
  app.post('/aninhada', rota(async (req, res) => {
    try {
      await db.db.transacao(async tx => {
        await tx.run(`INSERT INTO clients (id, nome, fone, criado_em) VALUES ('x-desfeita','Desfeita','4791111111','2026-01-01')`);
        throw new Error('desfaz só a interna');
      });
    } catch { /* esperado */ }
    await inserir('DepoisDaInterna');
    res.json({ ok: true });
  }));
  // Empresa marcada, e só dentro da transação.
  app.get('/empresa', rota(async (req, res) => {
    res.json(await db.db.get(`SELECT current_setting('app.tenant_id', true) AS empresa`));
  }));
  app.use((err, req, res, next) => { res.locals.desfazer = true; res.status(500).json({ erro: err.message }); });

  servidor = app.listen(0);
  await new Promise(ok => servidor.once('listening', ok));
  porta = servidor.address().port;
});

after(async () => {
  servidor.close();
  await db.pool.end();
});

const pedir = (metodo, caminho) => new Promise((ok, falha) => {
  const r = http.request({ hostname: '127.0.0.1', port: porta, path: caminho, method: metodo }, res => {
    let t = ''; res.on('data', x => t += x); res.on('end', () => ok({ status: res.statusCode, corpo: JSON.parse(t || 'null') }));
  });
  r.on('error', falha); r.end();
});

const existe = nome => db.db.comEmpresa('default', async () =>
  !!(await db.db.get('SELECT 1 FROM clients WHERE nome = ?', nome)));

describe('a requisição é uma transação', () => {
  test('a empresa está marcada durante a requisição', async () => {
    assert.equal((await pedir('GET', '/empresa')).corpo.empresa, 'default');
  });

  test('a marca não sobra na conexão depois da resposta', async () => {
    await pedir('GET', '/empresa');
    // Pega as conexões ociosas do pool, uma por uma: nenhuma pode lembrar de
    // empresa nenhuma. É o que um pooler em modo transação exige.
    const presas = [];
    for (let i = 0; i < db.pool.idleCount; i++) presas.push(await db.pool.connect());
    try {
      for (const c of presas) {
        const { rows } = await c.query(`SELECT current_setting('app.tenant_id', true) AS e`);
        assert.ok(!rows[0].e, `conexão com empresa marcada: ${rows[0].e}`);
      }
    } finally {
      presas.forEach(c => c.release());
    }
  });

  test('erro no meio desfaz o que veio antes', async () => {
    assert.equal((await pedir('POST', '/quebra')).status, 500);
    assert.equal(await existe('Quebrou'), false);
  });

  test('erro engolido com `opcional` não derruba a requisição', async () => {
    assert.equal((await pedir('POST', '/opcional')).status, 200);
    assert.equal(await existe('DepoisDoOpcional'), true);
  });

  test('transação envenenada vira 500, nunca um sucesso que não gravou', async () => {
    assert.equal((await pedir('POST', '/envenenada')).status, 500);
    assert.equal(await existe('Envenenada'), false);
  });

  test('transação interna desfaz só o que é dela', async () => {
    assert.equal((await pedir('POST', '/aninhada')).status, 200);
    assert.equal(await existe('Desfeita'), false);
    assert.equal(await existe('DepoisDaInterna'), true);
  });
});
