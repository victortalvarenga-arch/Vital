import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, cenario, subirApi, criarEquipe } from './ambiente.js';

/**
 * O telefone da ficha, pelo painel — onde a regra é OUTRA, de propósito.
 *
 * O site exige celular: é por ele que a cliente se identifica e é por ele que
 * sai toda mensagem. O painel aceita também o fixo, porque cliente que só tem
 * fixo existe — a de mais idade, que marca por telefone —, e um sistema que
 * recusa o cadastro dela está recusando uma cliente de verdade. O que o painel
 * não aceita é número impossível: DDD que não existe, tamanho errado, dígitos
 * todos iguais. Esse é lixo em qualquer tela.
 *
 * Decidido em 2026-11-13 (ROADMAP, Bloco 4c).
 */

let db, api, dona;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();

  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
  });

  ({ dono: dona } = await criarEquipe(api));
});

after(async () => {
  await api.fechar();
  await db.pool.end();
});

const criar = (nome, fone) => dona('POST', '/api/clientes', { nome, fone });
const ficha = fone => db.db.comEmpresa('default', () =>
  db.db.get('SELECT id, nome, fone FROM clients WHERE fone=?', fone));

describe('o painel aceita o telefone que o site não aceita', () => {
  test('fixo entra, porque a recepção às vezes só tem isso', async () => {
    const r = await criar('Dona Fixo', '4733334444');
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.ok(await ficha('4733334444'), 'não gravou a ficha');
  });

  test('celular continua entrando', async () => {
    const r = await criar('Cliente Celular', '47988881234');
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
  });

  test('mas o site não deixa essa mesma cliente se identificar pelo fixo', async () => {
    // O preço da decisão, escrito aqui para ninguém se surpreender depois: a
    // ficha existe e a cliente não entra por ela no site. Quem agenda por ela
    // é a recepção.
    const r = await api.anonimo()('POST', '/api/publico/identificar', { fone: '4733334444' });
    assert.equal(r.status, 400);
  });
});

describe('número impossível não entra nem pelo painel', () => {
  for (const [fone, motivo] of [
    ['00988887777', 'DDD que não existe'],
    ['479999', 'curto demais'],
    ['479888877771', 'comprido demais'],
    ['11999999999', 'dígitos repetidos'],
    ['', 'vazio'],
  ]) {
    test(`${motivo}: ${fone || '(vazio)'}`, async () => {
      const r = await criar('Cliente Ruim', fone);
      assert.equal(r.status, 400, `devolveu ${r.status}: ${JSON.stringify(r.corpo)}`);
      assert.equal(await ficha(fone), undefined, 'gravou mesmo assim');
    });
  }
});

describe('editar a ficha confere o telefone como criar', () => {
  test('não dá para trocar um número bom por lixo', async () => {
    const { corpo: criada } = await criar('Cliente Editável', '47988882222');
    const r = await dona('PUT', `/api/clientes/${criada.id}`, { ...criada, fone: '00000' });
    assert.equal(r.status, 400, `devolveu ${r.status}: ${JSON.stringify(r.corpo)}`);

    const depois = await ficha('47988882222');
    assert.ok(depois, 'o telefone bom foi perdido');
  });

  test('trocar para o número de outra ficha é 409, não erro de banco', async () => {
    // O índice único é por empresa; sem esta guarda, o UPDATE estoura no
    // Postgres, envenena a transação da requisição e a cliente vê um 500 sem
    // explicação — em vez de "já existe cliente com esse WhatsApp".
    const { corpo: a } = await criar('Primeira Ficha', '47988883333');
    await criar('Segunda Ficha', '47988884444');

    const r = await dona('PUT', `/api/clientes/${a.id}`, { ...a, fone: '47988884444' });
    assert.equal(r.status, 409, `devolveu ${r.status}: ${JSON.stringify(r.corpo)}`);
  });

  test('salvar a ficha sem mexer no telefone continua funcionando', async () => {
    const { corpo: c } = await criar('Cliente Intocada', '47988885555');
    const r = await dona('PUT', `/api/clientes/${c.id}`, { ...c, obs: 'alérgica a acetona' });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
  });
});

describe('quem recebe WhatsApp e quem não recebe', () => {
  test('a tela precisa saber para avisar a recepção', async () => {
    const { recebeWhatsapp } = await import('../src/lib/fone.js');
    assert.equal(recebeWhatsapp('47988887777'), true);
    assert.equal(recebeWhatsapp('4733334444'), false, 'fixo não recebe WhatsApp');
  });
});
