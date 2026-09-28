import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, limparAgenda, cenario, subirApi, criarEquipe } from './ambiente.js';

/**
 * Entrada: "pagou 20, falta 25", pela rota e chegando no Financeiro.
 *
 * O teste do `lib/pagamento.js` prova a aritmética; este prova o caminho
 * inteiro — que o valor é gravado, que o status vem dele, que desfazer devolve
 * o atendimento ao estado anterior e, principalmente, que o dinheiro aparece
 * nas contas do dono como parte e não como tudo. Foi essa última parte que
 * obrigou a mexer em toda consulta de caixa: somar `valor` onde entrou metade
 * é inventar faturamento.
 */

const DIA = '2027-04-08';   // uma quinta-feira

let db, api, dona;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    // Serviço de R$ 100 e comissão de 50%: os dois redondos de propósito, para
    // a conta do lucro caber de cabeça e o erro aparecer sozinho.
    await cenario(db);
    await db.db.run(`UPDATE staff SET comissao=50 WHERE id='p1'`);
    await db.db.run(`UPDATE services SET preco=100 WHERE id='s1'`);
  });
  ({ dono: dona } = await criarEquipe(api));
});

after(async () => {
  await api.fechar();
  await db.pool.end();
});

beforeEach(async () => {
  await db.db.comEmpresa('default', () => limparAgenda(db));
});

/** Um atendimento concluído às `hora`, sem nada pago. */
async function atendido(hora = '10:00') {
  const r = await dona('POST', '/api/agendamentos', {
    clienteId: 'c1', servicoId: 's1', profissionalId: 'p1', data: DIA, hora, forcar: true,
  });
  assert.equal(r.status, 201, r.corpo?.erro);
  await dona('PUT', `/api/agendamentos/${r.corpo.id}`, { status: 'concluido' });
  return r.corpo.id;
}

const resumo = async () =>
  (await dona('GET', `/api/relatorios/resumo?de=${DIA}&ate=${DIA}`)).corpo;

describe('entrada, pela rota', () => {
  test('receber parte deixa o atendimento parcial', async () => {
    const id = await atendido();
    const r = await dona('PUT', `/api/agendamentos/${id}`, {
      pagamento: { recebido: 20, forma: 'pix' },
    });
    assert.equal(r.status, 200, r.corpo?.erro);
    assert.equal(r.corpo.pagamento.status, 'parcial');
    assert.equal(Number(r.corpo.pagamento.recebido), 20);
    assert.equal(r.corpo.pagamento.forma, 'pix');
  });

  test('o resto quita, e o total não dobra', async () => {
    const id = await atendido();
    await dona('PUT', `/api/agendamentos/${id}`, { pagamento: { recebido: 20, forma: 'pix' } });
    const r = await dona('PUT', `/api/agendamentos/${id}`, {
      pagamento: { recebido: 100, forma: 'dinheiro' },
    });
    assert.equal(r.corpo.pagamento.status, 'pago');
    assert.equal(Number(r.corpo.pagamento.recebido), 100);
  });

  test('clicar na forma de novo desfaz o recebimento', async () => {
    const id = await atendido();
    await dona('PUT', `/api/agendamentos/${id}`, { pagamento: { status: 'pago', forma: 'pix' } });
    const r = await dona('PUT', `/api/agendamentos/${id}`, { pagamento: { status: 'aberto' } });
    assert.equal(r.corpo.pagamento.status, 'aberto');
    assert.equal(Number(r.corpo.pagamento.recebido), 0);
    assert.equal(r.corpo.pagamento.forma, 'local', 'sem dinheiro não há forma');
  });

  test('trocar a forma de quem já pagou não recebe de novo', async () => {
    const id = await atendido();
    await dona('PUT', `/api/agendamentos/${id}`, { pagamento: { status: 'pago', forma: 'pix' } });
    const r = await dona('PUT', `/api/agendamentos/${id}`, { pagamento: { forma: 'cartao' } });
    assert.equal(Number(r.corpo.pagamento.recebido), 100, 'trocou o método, não o valor');
    assert.equal(r.corpo.pagamento.forma, 'cartao');
    assert.equal(r.corpo.pagamento.status, 'pago');
  });

  test('valor negativo é recusado', async () => {
    const id = await atendido();
    const r = await dona('PUT', `/api/agendamentos/${id}`, { pagamento: { recebido: -5 } });
    assert.equal(r.status, 400);
  });

  test('receber não conclui o atendimento', async () => {
    // Sinal pago na marcação acontece dias antes de a cliente sentar.
    const r = await dona('POST', '/api/agendamentos', {
      clienteId: 'c1', servicoId: 's1', profissionalId: 'p1', data: DIA, hora: '15:00', forcar: true,
    });
    const pago = await dona('PUT', `/api/agendamentos/${r.corpo.id}`, {
      pagamento: { recebido: 30, forma: 'pix' },
    });
    assert.equal(pago.corpo.status, 'agendado', 'quem conclui é o fluxo, não o caixa');
  });

  test('o registro conta a entrada, a quitação e o estorno com frases diferentes', async () => {
    const id = await atendido();
    await dona('PUT', `/api/agendamentos/${id}`, { pagamento: { recebido: 20, forma: 'pix' } });
    await dona('PUT', `/api/agendamentos/${id}`, { pagamento: { recebido: 100, forma: 'pix' } });
    await dona('PUT', `/api/agendamentos/${id}`, { pagamento: { status: 'aberto' } });

    const acoes = (await dona('GET', '/api/logs')).corpo.map(l => l.acao);
    assert.ok(acoes.includes('agendamento.entrada'), 'a entrada tem nome próprio');
    assert.ok(acoes.includes('agendamento.pago'));
    assert.ok(acoes.includes('agendamento.pagamento_desfeito'), 'desfazer não passa como "alterou"');
  });
});

describe('a entrada nas contas do dono', () => {
  test('recebido soma o que entrou, e a receber cobra só o que falta', async () => {
    const id = await atendido('09:00');
    await atendido('11:00');   // nada pago
    await dona('PUT', `/api/agendamentos/${id}`, { pagamento: { recebido: 20, forma: 'pix' } });

    const r = await resumo();
    assert.equal(Number(r.recebido), 20, 'entrou 20, não 100');
    assert.equal(Number(r.aReceberNoPeriodo), 180, '80 do primeiro + 100 do segundo');
  });

  test('a divisão por forma bate com o recebido', async () => {
    const a = await atendido('09:00');
    const b = await atendido('11:00');
    await dona('PUT', `/api/agendamentos/${a}`, { pagamento: { recebido: 20, forma: 'pix' } });
    await dona('PUT', `/api/agendamentos/${b}`, { pagamento: { status: 'pago', forma: 'dinheiro' } });

    const r = await resumo();
    const soma = r.porForma.reduce((s, f) => s + Number(f.total), 0);
    assert.equal(soma, Number(r.recebido), 'as formas somam o caixa, sem sobra nem falta');
    assert.equal(Number(r.porForma.find(f => f.forma === 'pix').total), 20);
  });

  test('a comissão sai do que entrou, não do que foi vendido', async () => {
    const id = await atendido('09:00');
    await dona('PUT', `/api/agendamentos/${id}`, { pagamento: { recebido: 20, forma: 'pix' } });

    const r = await resumo();
    assert.equal(Number(r.custos), 10, '50% de 20, e não 50% de 100');
    assert.equal(Number(r.lucro), 10, 'o que sobrou do que entrou');
  });

  test('desfazer o pagamento tira o dinheiro do caixa', async () => {
    const id = await atendido('09:00');
    await dona('PUT', `/api/agendamentos/${id}`, { pagamento: { status: 'pago', forma: 'pix' } });
    assert.equal(Number((await resumo()).recebido), 100);

    await dona('PUT', `/api/agendamentos/${id}`, { pagamento: { status: 'aberto' } });
    const r = await resumo();
    assert.equal(Number(r.recebido), 0);
    assert.equal(Number(r.custos), 0, 'comissão de dinheiro que voltou não se paga');
  });

  test('o fechamento automático quita a entrada que ficou pelo caminho', async () => {
    const { hoje, addDias } = await import('../src/lib/dates.js');
    const ontem = addDias(hoje(), -1);
    const r = await dona('POST', '/api/agendamentos', {
      clienteId: 'c1', servicoId: 's1', profissionalId: 'p1', data: ontem, hora: '10:00', forcar: true,
    });
    await dona('PUT', `/api/agendamentos/${r.corpo.id}`, { pagamento: { recebido: 20, forma: 'pix' } });

    const { fecharAtendimentos } = await import('../src/jobs/fechamento.js');
    await db.db.comEmpresa('default', () => fecharAtendimentos());

    const depois = await dona('GET', `/api/agendamentos?de=${ontem}&ate=${ontem}`);
    const fechado = depois.corpo.find(a => a.id === r.corpo.id);
    assert.equal(fechado.pagamento.status, 'pago');
    assert.equal(Number(fechado.pagamento.recebido), 100, 'o resto entrou no balcão');
    assert.equal(fechado.pagamento.forma, 'pix', 'a forma da entrada diz mais que "local"');
  });
});
