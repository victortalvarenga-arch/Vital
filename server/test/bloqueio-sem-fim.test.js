import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, limparAgenda, cenario, subirApi, criarEquipe } from './ambiente.js';

/**
 * Bloqueio que "nunca termina" (decisão de 2026-10-28, migration 028).
 *
 * Antes, o "Nunca" criava 12 meses de datas e parava: um ano depois a folga
 * semanal sumia sem aviso. Agora a regra fica guardada e um job estende a
 * série. O que precisa continuar valendo: estender cria só o que falta, sem
 * repetir data; liberar uma ocorrência não a faz voltar; liberar a série
 * inteira encerra a regra.
 */

const TERCA = '2027-03-02';        // uma terça-feira; o horizonte vai até 2028-03-01

let db, api, dona, estenderSeries;

before(async () => {
  db = await prepararBanco();
  ({ estenderSeries } = await import('../src/jobs/bloqueios.js'));
  api = await subirApi();
  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
  });
  ({ dono: dona } = await criarEquipe(api));
});

beforeEach(() => db.db.comEmpresa('default', () => limparAgenda(db)));

after(async () => {
  await api.fechar();
  await db.pool.end();
});

/** Três terças, como a tela mandaria, com a regra de "nunca termina". */
const criarSemFim = () => dona('POST', '/api/bloqueios', {
  profissionalId: 'p1', horaIni: '12:00', horaFim: '13:00', motivo: 'almoço',
  datas: [TERCA, '2027-03-09', '2027-03-16'],
  continua: { repetir: 'semanal', diasSemana: [2], inicio: TERCA },
});

const datasDa = serie => db.db.comEmpresa('default', async () =>
  (await db.db.all('SELECT data FROM blocks WHERE serie = ? ORDER BY data', serie)).map(r => r.data));
const estender = () => db.db.comEmpresa('default', () => estenderSeries({ hojeISO: TERCA }));

describe('série sem fim', () => {
  test('o job completa um ano de terças, sem repetir nenhuma', async () => {
    const r = await criarSemFim();
    assert.equal(r.status, 201, r.corpo?.erro);

    assert.equal(await estender(), 50);
    const datas = await datasDa(r.corpo.serie);
    assert.equal(datas.length, 53, 'todas as terças de um ano');
    assert.equal(new Set(datas).size, datas.length, 'nenhuma data duas vezes');
    assert.equal(datas.at(-1), '2028-02-29');
    assert.ok(datas.every(d => new Date(d + 'T12:00:00').getDay() === 2), 'só terças');

    assert.equal(await estender(), 0, 'rodar de novo no mesmo dia não cria nada');
  });

  test('a terça liberada à mão não volta', async () => {
    const r = await criarSemFim();
    const segunda = await db.db.comEmpresa('default', () =>
      db.db.get(`SELECT id FROM blocks WHERE serie = ? AND data = '2027-03-09'`, r.corpo.serie));
    assert.equal((await dona('DELETE', `/api/bloqueios/${segunda.id}`)).status, 200);

    await estender();
    assert.ok(!(await datasDa(r.corpo.serie)).includes('2027-03-09'));
  });

  test('liberar a série inteira encerra a regra', async () => {
    const r = await criarSemFim();
    const primeira = await db.db.comEmpresa('default', () =>
      db.db.get('SELECT id FROM blocks WHERE serie = ? LIMIT 1', r.corpo.serie));
    assert.equal((await dona('DELETE', `/api/bloqueios/${primeira.id}?serie=1`)).status, 200);

    // A regra sai na hora, não só na próxima passada do job.
    const regras = await db.db.comEmpresa('default', () =>
      db.db.get('SELECT count(*)::int n FROM bloqueio_series WHERE serie = ?', r.corpo.serie));
    assert.equal(regras.n, 0);
    assert.equal(await estender(), 0);
    assert.deepEqual(await datasDa(r.corpo.serie), []);
  });

  test('sem "continua", a série tem fim e o job não mexe nela', async () => {
    const r = await dona('POST', '/api/bloqueios', {
      profissionalId: 'p1', horaIni: '12:00', horaFim: '13:00', datas: [TERCA, '2027-03-09'],
    });
    assert.equal(r.status, 201);
    assert.equal(await estender(), 0);
    assert.equal((await datasDa(r.corpo.serie)).length, 2);
  });
});
