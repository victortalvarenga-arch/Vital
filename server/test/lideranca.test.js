import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco } from './ambiente.js';

/**
 * Duas cópias de pé ao mesmo tempo: só uma roda os jobs, e as migrations não
 * brigam.
 */

let db, lideranca;

before(async () => {
  db = await prepararBanco();
  lideranca = await import('../src/lib/lideranca.js');
});

after(async () => {
  await db.pool.end();
});

describe('quem roda os jobs', () => {
  test('a segunda cópia fica de reserva, e assume quando a primeira solta', async () => {
    // Soltar no `finally`: trava presa por um teste que falhou seguraria uma
    // conexão, e o encerramento do pool esperaria por ela para sempre.
    const pegas = [];
    try {
      const primeira = await lideranca.tentarLideranca();
      pegas.push(primeira);
      assert.equal(primeira.lider, true);

      const segunda = await lideranca.tentarLideranca();
      pegas.push(segunda);
      assert.equal(segunda.lider, false, 'duas cópias nunca rodam os jobs juntas');

      await primeira.soltar();
      const terceira = await lideranca.tentarLideranca();
      pegas.push(terceira);
      assert.equal(terceira.lider, true, 'com a primeira fora, a reserva assume');
    } finally {
      for (const p of pegas) await p.soltar?.();
    }
  });

  test('cópia que morre solta a trava sozinha', async () => {
    // A trava é da conexão: conexão encerrada (processo morto) é trava solta,
    // sem ninguém precisar soltar nada.
    const { pool } = db;
    const c = await pool.connect();
    await c.query('SELECT pg_advisory_lock(727002001)');
    c.release(true);   // destrói a conexão, como um processo que caiu
    await new Promise(ok => setTimeout(ok, 100));
    const depois = await lideranca.tentarLideranca();
    assert.equal(depois.lider, true);
    await depois.soltar();
  });
});

describe('migrations com duas cópias subindo juntas', () => {
  test('rodar duas vezes ao mesmo tempo não dá erro', async () => {
    await Promise.all([db.iniciarBanco(), db.iniciarBanco()]);
  });
});
