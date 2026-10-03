import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, limparAgenda, cenario, subirApi, criarEquipe } from './ambiente.js';

/**
 * Promoção com regras (migration 021): começo, dias da semana, limite, pausa,
 * e o desconto gravado na venda.
 *
 * O que precisa ser verdade, e só um teste com banco prova:
 *
 *  1. As regras valem na VENDA, não só na tela: o servidor recusa o dia fora
 *     da promoção, a agendada, a pausada e a esgotada.
 *  2. O limite aguenta duas vendas no mesmo instante — a última vaga vai para
 *     uma pessoa só.
 *  3. O "desconto concedido" é o da venda, e soma o que a cliente deixou de
 *     pagar.
 */

const TERCA = '2027-03-02';
const QUINTA = '2027-03-04';
const LONGE = '2099-01-01';   // um começo que não chega durante o teste

let db, api, dona;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    // Corte R$ 100 (das duas) + Sobrancelha R$ 50 (só da Ana) = R$ 150 avulso.
    await cenario(db);
    await db.db.run(
      `INSERT INTO services (id,nome,categoria,preco,duracao,intervalo,ativo,ordem)
       VALUES ('s2','Design de sobrancelha','Rosto',50,30,0,1,1)`
    );
    await db.salvarVinculos('s2', ['p1']);
  });
  ({ dono: dona } = await criarEquipe(api));
});

after(async () => {
  await api?.fechar();
  await db?.pool.end();
});

beforeEach(async () => {
  await db.db.comEmpresa('default', async () => {
    await limparAgenda(db);
    await db.db.run('DELETE FROM combo_services');
    await db.db.run('DELETE FROM combos');
  });
});

/** O pacote de R$ 130, com as regras que o teste pedir. */
async function promocao(regras = {}) {
  const r = await dona('POST', '/api/combos', {
    nome: 'Terça da beleza', preco: 130, servicosIds: ['s1', 's2'], ...regras,
  });
  assert.equal(r.status, 201, r.corpo?.erro);
  return r.corpo;
}

const vender = (comboId, data, hora = '10:00') => dona('POST', '/api/agendamentos/combo', {
  comboId, clienteId: 'c1', profissionalId: 'p1', data, hora,
});

describe('quando a promoção vale', () => {
  test('dias da semana olham a data do atendimento', async () => {
    const c = await promocao({ diasSemana: [2] });
    assert.deepEqual(c.diasSemana, [2]);
    assert.equal((await vender(c.id, QUINTA)).status, 409, 'quinta não é terça');
    assert.equal((await vender(c.id, TERCA)).status, 201);
  });

  test('o calendário do site só oferece os dias da promoção', async () => {
    const c = await promocao({ diasSemana: [2] });
    const r = await api.anonimo()('GET', `/api/publico/dias-livres?comboId=${c.id}&mes=2027-03`);
    assert.equal(r.status, 200);
    assert.ok(r.corpo.dias.length > 0, 'precisa haver terças com vaga para o teste valer');
    for (const d of r.corpo.dias) {
      assert.equal(new Date(d + 'T12:00:00').getDay(), 2, `${d} não é terça`);
    }
  });

  test('agendada não vende nem aparece no site', async () => {
    const c = await promocao({ validoDe: LONGE });
    assert.equal(c.situacao, 'agendada');
    assert.equal((await vender(c.id, TERCA)).status, 409);
    const vitrine = (await api.anonimo()('GET', '/api/publico/vitrine')).corpo;
    assert.equal(vitrine.combos.some(x => x.id === c.id), false);
  });

  test('pausada não vende, e volta ao religar', async () => {
    const c = await promocao();
    const corpo = { nome: c.nome, preco: c.preco, servicosIds: ['s1', 's2'] };
    await dona('PUT', `/api/combos/${c.id}`, { ...corpo, ativo: false });
    assert.equal((await vender(c.id, TERCA)).status, 409);
    const lista = (await dona('GET', '/api/combos')).corpo;
    assert.equal(lista.find(x => x.id === c.id)?.situacao, 'pausada', 'pausada continua no painel');

    await dona('PUT', `/api/combos/${c.id}`, { ...corpo, ativo: true });
    assert.equal((await vender(c.id, TERCA)).status, 201);
  });

  test('arquivar tira do painel; pausar não', async () => {
    const c = await promocao();
    await dona('DELETE', `/api/combos/${c.id}`);
    const lista = (await dona('GET', '/api/combos')).corpo;
    assert.equal(lista.some(x => x.id === c.id), false);
  });
});

describe('limite de utilizações', () => {
  test('a venda além do limite é recusada, e o cancelamento devolve a vaga', async () => {
    const c = await promocao({ limiteUsos: 1 });
    const primeira = await vender(c.id, TERCA, '10:00');
    assert.equal(primeira.status, 201);
    assert.equal((await vender(c.id, TERCA, '14:00')).status, 409);

    await dona('PUT', `/api/agendamentos/${primeira.corpo.agendamentos[0].id}`, { status: 'cancelado' });
    assert.equal((await vender(c.id, TERCA, '14:00')).status, 201, 'cancelada não conta');
  });

  test('duas vendas no mesmo instante não levam a última vaga juntas', async () => {
    const c = await promocao({ limiteUsos: 1 });
    const [a, b] = await Promise.all([vender(c.id, TERCA, '10:00'), vender(c.id, QUINTA, '10:00')]);
    assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  });

  test('limite zero ou quebrado é recusado no cadastro', async () => {
    const r = await dona('POST', '/api/combos', {
      nome: 'X', preco: 130, servicosIds: ['s1', 's2'], limiteUsos: 0,
    });
    assert.equal(r.status, 400);
  });

  test('promoção que termina antes de começar é recusada', async () => {
    const r = await dona('POST', '/api/combos', {
      nome: 'X', preco: 130, servicosIds: ['s1', 's2'], validoDe: QUINTA, validoAte: TERCA,
    });
    assert.equal(r.status, 400);
  });
});

describe('desempenho', () => {
  test('o desconto é o da venda, e soma o que a cliente deixou de pagar', async () => {
    const c = await promocao();
    assert.equal((await vender(c.id, TERCA)).status, 201);

    // Reajustar a tabela depois não pode mudar o desconto que já foi dado.
    await db.db.comEmpresa('default', () => db.db.run(`UPDATE services SET preco = 500 WHERE id = 's1'`));
    try {
      const r = (await dona('GET', `/api/combos/desempenho?de=${TERCA}&ate=${TERCA}`)).corpo;
      assert.deepEqual(r.total, { usos: 1, receita: 130, desconto: 20 });
      assert.deepEqual(r.porCombo[c.id], { usos: 1, receita: 130, desconto: 20 });
    } finally {
      await db.db.comEmpresa('default', () => db.db.run(`UPDATE services SET preco = 100 WHERE id = 's1'`));
    }
  });
});
