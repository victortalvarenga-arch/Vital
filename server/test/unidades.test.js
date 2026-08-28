import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, limparAgenda, cenario, subirApi, criarEquipe } from './ambiente.js';

/**
 * Unidades: a empresa com mais de um endereço.
 *
 * A tabela existia desde o Bloco 0 e **nenhuma rota a usava** — uma empresa com
 * duas lojas conseguia cadastrá-las por SQL e mais nada. É o mesmo tipo de
 * buraco que os bloqueios de horário tinham: estrutura de dado pronta, produto
 * ausente, e nada falhando para avisar.
 *
 * A decisão que sustenta tudo aqui: **a unidade é da profissional, não do
 * serviço.** É ela que ocupa uma cadeira num endereço, e o motor de horários já
 * raciocina por profissional — então filtrar por unidade é filtrar quem atende,
 * e o motor não mudou uma linha.
 */

const DIA = '2027-03-05';

let db, api, dona, ana;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
  });
  ({ dono: dona, ana } = await criarEquipe(api));
});

after(async () => {
  await api.fechar();
  await db.pool.end();
});

beforeEach(async () => {
  await db.db.comEmpresa('default', async () => {
    await limparAgenda(db);
    await db.db.run('UPDATE staff SET unit_id = NULL');
    await db.db.run('DELETE FROM units');
  });
});

const novaUnidade = (corpo = {}) => dona('POST', '/api/unidades', {
  nome: 'Centro', endereco: 'Rua XV, 100', fone: '4733334444', ...corpo,
});

describe('cadastro', () => {
  test('cria e lista', async () => {
    const r = await novaUnidade();
    assert.equal(r.status, 201);
    assert.equal(r.corpo.nome, 'Centro');
    assert.equal(r.corpo.ativo, true);

    const lista = await dona('GET', '/api/unidades');
    assert.equal(lista.corpo.length, 1);
  });

  test('recusa nome vazio e link de mapa que não é link', async () => {
    assert.equal((await novaUnidade({ nome: ' ' })).status, 400);
    assert.equal((await novaUnidade({ mapa: 'google maps' })).status, 400);
    assert.equal((await novaUnidade({ mapa: 'https://maps.google.com/?q=x' })).status, 201);
  });

  test('quem não cuida de cadastro não cria unidade', async () => {
    // Unidade é estrutura do negócio, diferente de promoção: mudar endereço
    // muda onde a agenda inteira acontece.
    assert.equal((await ana('POST', '/api/unidades', { nome: 'Fundos' })).status, 403);
  });

  test('arquivar não apaga — a agenda antiga aponta para a unidade', async () => {
    const { corpo: u } = await novaUnidade();
    await dona('PUT', `/api/profissionais/p1`, { unidadeId: u.id });

    const r = await dona('DELETE', `/api/unidades/${u.id}`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.corpo.semUnidade, ['Ana'],
      'avisa quem ficou sem casa em vez de desvincular por conta própria');

    const lista = await dona('GET', '/api/unidades');
    assert.equal(lista.corpo[0].ativo, false, 'continua existindo, arquivada');
  });
});

describe('a unidade é de quem atende', () => {
  test('a profissional guarda a unidade', async () => {
    const { corpo: u } = await novaUnidade();
    const r = await dona('PUT', '/api/profissionais/p1', { unidadeId: u.id });
    assert.equal(r.corpo.unidadeId, u.id);
  });

  test('unidade inventada vira nulo, não erro', async () => {
    // Vem de um `select` do front; id que não existe é bug nosso, e derrubar o
    // salvamento por causa dele perderia o resto do formulário.
    const r = await dona('PUT', '/api/profissionais/p1', { unidadeId: 'nao-existe' });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.unidadeId, null);
  });

  test('o agendamento congela onde aconteceu', async () => {
    const { corpo: u } = await novaUnidade();
    await dona('PUT', '/api/profissionais/p1', { unidadeId: u.id });

    const criado = await dona('POST', '/api/agendamentos', {
      clienteId: 'c1', servicoId: 's1', profissionalId: 'p1', data: DIA, hora: '10:00',
    });
    assert.equal(criado.corpo.unidadeId, u.id);

    // Mudar a pessoa de loja não reescreve onde o atendimento passado ocorreu.
    const { corpo: outra } = await novaUnidade({ nome: 'Zona Sul' });
    await dona('PUT', '/api/profissionais/p1', { unidadeId: outra.id });

    const { corpo } = await dona('GET', `/api/agendamentos?data=${DIA}`);
    assert.equal(corpo[0].unidadeId, u.id);
  });
});

describe('o site oferece por unidade', () => {
  test('a vitrine lista as unidades ativas', async () => {
    await novaUnidade();
    await novaUnidade({ nome: 'Zona Sul' });
    const { corpo } = await api.anonimo()('GET', '/api/publico/vitrine');
    assert.deepEqual(corpo.unidades.map(u => u.nome).sort(), ['Centro', 'Zona Sul']);
  });

  test('escolher a unidade recorta quem atende ali', async () => {
    const { corpo: centro } = await novaUnidade();
    const { corpo: sul } = await novaUnidade({ nome: 'Zona Sul' });
    await dona('PUT', '/api/profissionais/p1', { unidadeId: centro.id });
    await dona('PUT', '/api/profissionais/p2', { unidadeId: sul.id });

    const noCentro = await api.anonimo()(
      'GET', `/api/publico/horarios?servicoId=s1&data=${DIA}&unidadeId=${centro.id}`);
    assert.deepEqual(noCentro.corpo.porProfissional.map(p => p.profissionalId), ['p1']);

    const noSul = await api.anonimo()(
      'GET', `/api/publico/horarios?servicoId=s1&data=${DIA}&unidadeId=${sul.id}`);
    assert.deepEqual(noSul.corpo.porProfissional.map(p => p.profissionalId), ['p2']);
  });

  test('sem unidade escolhida, aparecem todas as pessoas', async () => {
    const { corpo: centro } = await novaUnidade();
    await dona('PUT', '/api/profissionais/p1', { unidadeId: centro.id });

    const r = await api.anonimo()('GET', `/api/publico/horarios?servicoId=s1&data=${DIA}`);
    assert.equal(r.corpo.porProfissional.length, 2);
  });

  test('quem está sem unidade atende em qualquer uma', async () => {
    // É o estado de toda profissional de antes desta funcionalidade: ligar
    // unidades não pode sumir com a equipe das telas de quem já usa o sistema.
    const { corpo: centro } = await novaUnidade();
    await dona('PUT', '/api/profissionais/p1', { unidadeId: centro.id });
    // p2 fica sem unidade.

    const r = await api.anonimo()(
      'GET', `/api/publico/horarios?servicoId=s1&data=${DIA}&unidadeId=${centro.id}`);
    assert.deepEqual(r.corpo.porProfissional.map(p => p.profissionalId).sort(), ['p1', 'p2']);
  });

  test('o calendário do mês respeita a unidade', async () => {
    const { corpo: centro } = await novaUnidade();
    const { corpo: sul } = await novaUnidade({ nome: 'Zona Sul' });
    await dona('PUT', '/api/profissionais/p1', { unidadeId: centro.id });
    await dona('PUT', '/api/profissionais/p2', { unidadeId: sul.id });

    // Fecha a agenda de quem atende no Centro; o mês some para aquela unidade
    // e continua aberto para a outra.
    await db.db.comEmpresa('default', () => db.db.run(
      `UPDATE staff SET jornada = '{}' WHERE id = 'p1'`
    ));

    const centroDias = await api.anonimo()(
      'GET', `/api/publico/dias-livres?servicoId=s1&mes=2027-03&unidadeId=${centro.id}`);
    const sulDias = await api.anonimo()(
      'GET', `/api/publico/dias-livres?servicoId=s1&mes=2027-03&unidadeId=${sul.id}`);

    assert.deepEqual(centroDias.corpo.dias, []);
    assert.ok(sulDias.corpo.dias.length > 0);

    await db.db.comEmpresa('default', () => db.db.run(
      `UPDATE staff SET jornada = (SELECT jornada FROM staff WHERE id='p2') WHERE id = 'p1'`
    ));
  });
});

describe('empresa de uma unidade só não paga nada por isso', () => {
  test('sem unidade cadastrada, tudo funciona como antes', async () => {
    const r = await api.anonimo()('GET', `/api/publico/horarios?servicoId=s1&data=${DIA}`);
    assert.equal(r.corpo.porProfissional.length, 2);

    const criado = await dona('POST', '/api/agendamentos', {
      clienteId: 'c1', servicoId: 's1', profissionalId: 'p1', data: DIA, hora: '11:00',
    });
    assert.equal(criado.status, 201);
    assert.equal(criado.corpo.unidadeId, null);

    const { corpo } = await api.anonimo()('GET', '/api/publico/vitrine');
    assert.deepEqual(corpo.unidades, []);
  });
});
