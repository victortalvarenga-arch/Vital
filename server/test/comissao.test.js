import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, limparAgenda, cenario, subirApi, criarEquipe } from './ambiente.js';

/**
 * Comissão em três níveis (migration 020): a da pessoa naquele serviço, senão
 * a do serviço, senão a da pessoa.
 *
 * O que só o banco prova: que o dinheiro do Resumo, da série, do mês e do
 * Financeiro sai da MESMA regra — as quatro consultas usam `TAXA` — e que
 * nulo e zero não se confundem. Confundir os dois é tirar a comissão de alguém
 * sem ninguém ter decidido isso.
 *
 * Serviço de R$ 100 pago por inteiro: a comissão em reais é o próprio
 * percentual, e o erro aparece sozinho.
 */

const DIA = '2027-05-06';

let db, api, dona;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
    await db.db.run(`UPDATE staff SET comissao=40 WHERE id='p1'`);
  });
  ({ dono: dona } = await criarEquipe(api));
});

after(async () => {
  await api.fechar();
  await db.pool.end();
});

beforeEach(async () => {
  await db.db.comEmpresa('default', async () => {
    await limparAgenda(db);
    await db.db.run(`UPDATE services SET comissao=NULL, obs='' WHERE id='s1'`);
    await db.db.run(`UPDATE service_staff SET comissao=NULL`);
    await db.db.run(`UPDATE staff SET comissao=40, comissao_tipo='percentual', comissao_fixo=NULL WHERE id='p1'`);
    await db.salvarVinculos('s1', ['p1', 'p2'], {});
  });
});

/** Um atendimento da Ana (p1), concluído e pago por inteiro. */
async function atendidoEPago() {
  const r = await dona('POST', '/api/agendamentos', {
    clienteId: 'c1', servicoId: 's1', profissionalId: 'p1', data: DIA, hora: '10:00', forcar: true,
  });
  assert.equal(r.status, 201, r.corpo?.erro);
  await dona('PUT', `/api/agendamentos/${r.corpo.id}`, { status: 'concluido' });
  await dona('PUT', `/api/agendamentos/${r.corpo.id}`, { pagamento: { recebido: 100, forma: 'pix' } });
}

const custos = async () =>
  (await dona('GET', `/api/relatorios/resumo?de=${DIA}&ate=${DIA}`)).corpo.custos;

const servico = async () =>
  (await dona('GET', '/api/servicos')).corpo.find(s => s.id === 's1');

/** O serviço inteiro de volta, com o que mudar — como a tela manda. */
async function salvarServico(mudanca) {
  const atual = await servico();
  return dona('PUT', '/api/servicos/s1', { ...atual, ...mudanca });
}

describe('qual comissão vale', () => {
  test('sem nada no serviço, vale a da profissional', async () => {
    await atendidoEPago();
    assert.equal(await custos(), 40);
  });

  test('a do serviço passa na frente da profissional', async () => {
    assert.equal((await salvarServico({ comissao: 10 })).status, 200);
    await atendidoEPago();
    assert.equal(await custos(), 10);
  });

  test('a exceção da pessoa no serviço passa na frente das duas', async () => {
    await salvarServico({ comissao: 10, comissoes: { p1: 25 } });
    await atendidoEPago();
    assert.equal(await custos(), 25);
  });

  test('zero é comissão de verdade, não "vale a de cima"', async () => {
    await salvarServico({ comissao: 0 });
    await atendidoEPago();
    assert.equal(await custos(), 0, 'zero no serviço não pode cair para os 40% da pessoa');
  });

  test('o Financeiro, a série e o mês fazem a mesma conta que o Resumo', async () => {
    await salvarServico({ comissao: 10, comissoes: { p1: 25 } });
    await atendidoEPago();

    const resumo = (await dona('GET', `/api/relatorios/resumo?de=${DIA}&ate=${DIA}`)).corpo;
    const ana = resumo.porProfissional.find(p => p.id === 'p1');
    assert.equal(ana.comissaoValor, 25);

    const serie = (await dona('GET', `/api/relatorios/serie?por=dia&de=${DIA}&ate=${DIA}`)).corpo;
    assert.equal(serie.pontos[0].custos, 25);
  });
});

describe('editar', () => {
  test('comissão fora de 0 a 100 é recusada, e nada é gravado', async () => {
    const r = await salvarServico({ comissao: 150, obs: 'não deveria gravar' });
    assert.equal(r.status, 400);
    assert.equal((await servico()).obs, '');
  });

  test('vazio é nulo: o campo apagado volta a herdar', async () => {
    await salvarServico({ comissao: 10 });
    await salvarServico({ comissao: '' });
    assert.equal((await servico()).comissao, null);
  });

  test('pela profissional, a exceção aparece no serviço — e nulo a apaga', async () => {
    const r = await dona('PUT', '/api/profissionais/p1/comissoes', { comissoes: { s1: 30 } });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.alteradas, 1);
    assert.deepEqual((await servico()).comissoes, { p1: 30 });

    await dona('PUT', '/api/profissionais/p1/comissoes', { comissoes: { s1: null } });
    assert.deepEqual((await servico()).comissoes, {});
  });

  test('salvar só quem executa não apaga a exceção de ninguém', async () => {
    await dona('PUT', '/api/profissionais/p1/comissoes', { comissoes: { s1: 30 } });
    await dona('PUT', '/api/servicos/s1', { profissionais: ['p1', 'p2'] });
    assert.deepEqual((await servico()).comissoes, { p1: 30 });
  });
});

describe('o site', () => {
  test('não mostra comissão nem observação interna', async () => {
    await salvarServico({ comissao: 10, comissoes: { p1: 25 }, obs: 'só a equipe lê isto' });
    const vitrine = (await api.anonimo()('GET', '/api/publico/vitrine')).corpo;
    const s = vitrine.servicos.find(x => x.id === 's1');
    assert.ok(s, 'o serviço precisa estar na vitrine para o teste valer');
    for (const campo of ['comissao', 'comissoes', 'obs']) {
      assert.equal(campo in s, false, `"${campo}" vazou para o site`);
    }
  });
});

describe('comissão fixa da profissional (migration 022)', () => {
  const fixa = valor => dona('PUT', '/api/profissionais/p1', { comissaoTipo: 'fixo', comissaoFixo: valor });

  test('sem nada no serviço, sai o fixo por atendimento', async () => {
    assert.equal((await fixa(30)).status, 200);
    await atendidoEPago();
    assert.equal(await custos(), 30);
  });

  test('pagou metade, sai metade do fixo', async () => {
    await fixa(30);
    const r = await dona('POST', '/api/agendamentos', {
      clienteId: 'c1', servicoId: 's1', profissionalId: 'p1', data: DIA, hora: '10:00', forcar: true,
    });
    await dona('PUT', `/api/agendamentos/${r.corpo.id}`, { status: 'concluido' });
    await dona('PUT', `/api/agendamentos/${r.corpo.id}`, { pagamento: { recebido: 50, forma: 'pix' } });
    assert.equal(await custos(), 15);
  });

  test('a comissão do serviço passa por cima do fixo', async () => {
    await fixa(30);
    await salvarServico({ comissao: 10 });
    await atendidoEPago();
    assert.equal(await custos(), 10);
  });

  test('a produção do Financeiro usa o mesmo fixo', async () => {
    await fixa(30);
    await atendidoEPago();
    const resumo = (await dona('GET', `/api/relatorios/resumo?de=${DIA}&ate=${DIA}`)).corpo;
    assert.equal(resumo.porProfissional.find(p => p.id === 'p1').comissaoValor, 30);
  });

  test('fixo sem valor é recusado', async () => {
    const r = await dona('PUT', '/api/profissionais/p1', { comissaoTipo: 'fixo', comissaoFixo: '' });
    assert.equal(r.status, 400);
  });
});

describe('serviços pelo lado da profissional', () => {
  test('desmarca, mantém e grava a exceção de uma vez', async () => {
    const r = await dona('PUT', '/api/profissionais/p2/servicos', { servicos: [], comissoes: {} });
    assert.equal(r.status, 200);
    assert.deepEqual((await servico()).profissionais.sort(), ['p1']);

    await dona('PUT', '/api/profissionais/p2/servicos', { servicos: ['s1'], comissoes: { s1: 20 } });
    const s = await servico();
    assert.deepEqual(s.profissionais.sort(), ['p1', 'p2']);
    assert.deepEqual(s.comissoes, { p2: 20 });
  });

  test('serviço que não existe é recusado sem mexer em nada', async () => {
    const r = await dona('PUT', '/api/profissionais/p2/servicos', { servicos: ['s1', 'nao-existe'] });
    assert.equal(r.status, 400);
    assert.ok((await servico()).profissionais.includes('p2'));
  });
});
