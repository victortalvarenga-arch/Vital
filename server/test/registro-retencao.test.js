import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, cenario, comoAdmin } from './ambiente.js';

/**
 * O registro do painel guarda dois anos (decisão de 2026-10-28).
 *
 * A aplicação não tem DELETE em `logs`; a única porta é
 * `plataforma.podar_registro`, e ela só pode alcançar o que passou do prazo.
 */

let db, podarRegistro;

before(async () => {
  db = await prepararBanco();
  ({ podarRegistro } = await import('../src/jobs/registro.js'));
  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
  });
  await comoAdmin('DELETE FROM logs');
});

after(async () => {
  await comoAdmin('DELETE FROM logs');
  await db.pool.end();
});

const registrar = (resumo, idade) => comoAdmin(
  `INSERT INTO logs (tenant_id, acao, resumo, criado_em) VALUES ('default', 'teste', $1, now() - $2::interval)`,
  resumo, idade
);
const restantes = async () => (await comoAdmin(`SELECT resumo FROM logs ORDER BY resumo`)).rows.map(r => r.resumo);

describe('prazo do registro', () => {
  test('apaga o que passou de dois anos e mantém o resto', async () => {
    await registrar('antigo', '731 days');
    await registrar('quase', '729 days');
    await registrar('ontem', '1 day');

    assert.equal(await podarRegistro(), 1);
    assert.deepEqual(await restantes(), ['ontem', 'quase']);
  });

  test('prazo menor que um ano é recusado, e nada sai', async () => {
    await assert.rejects(podarRegistro({ retencao: 30 }), /abaixo de um ano/);
    assert.deepEqual(await restantes(), ['ontem', 'quase']);
  });

  test('a aplicação continua sem poder apagar o registro por fora', async () => {
    await assert.rejects(
      db.db.comEmpresa('default', () => db.db.run(`DELETE FROM logs`)),
      /permission denied|permissão negada/
    );
  });
});
