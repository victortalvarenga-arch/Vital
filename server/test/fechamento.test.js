import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, limparAgenda, cenario, subirApi, criarEquipe } from './ambiente.js';

/**
 * Fechamento automático: passou a hora sem ninguém marcar, fica pendente.
 *
 * Decisão de 2026-11-04 (migration 034): o relógio deixa de presumir que a
 * cliente veio. O que se prova aqui, em ordem de estrago se falhar:
 *
 * 1. **O relógio não conclui ninguém.** Passou da hora → `pendente`, e o caixa
 *    não ganha dinheiro registrado — só estimado, em linha separada.
 * 2. **A equipe confirma em lote, e só o que viu.** "Todos vieram" vale para os
 *    ids do aviso, de quantos dias for, no recorte de quem pede.
 * 3. **Presença não é pagamento.** Confirmada, ela segue presumida até alguém
 *    registrar o que entrou.
 * 4. **Tudo fica no histórico**, com o sistema na passagem para pendente e a
 *    pessoa da equipe na confirmação.
 */

let db, api, dona, ana, fechar, hoje, agora, addDias;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  // Depois de prepararBanco, senão o import estático prende o pool no banco
  // de trabalho — ver CLAUDE.md.
  ({ fecharAtendimentos: fechar } = await import('../src/jobs/fechamento.js'));
  ({ hoje, agora, addDias } = await import('../src/lib/dates.js'));
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
  await db.db.comEmpresa('default', () => limparAgenda(db));
});

const naEmpresa = fn => db.db.comEmpresa('default', fn);

/** Agenda no dia/hora pedidos, direto no banco (o motor recusaria o passado). */
async function agendar({ data, hora = '09:00', duracao = 60, status = 'agendado', valor = 100,
  recebido = 0, prof = 'p1' }) {
  const id = 'a' + Math.random().toString(36).slice(2, 10);
  await naEmpresa(() => db.db.run(
    `INSERT INTO appointments (id,client_id,service_id,staff_id,data,hora,duracao,valor,status,
                               pag_status,pag_recebido,origem,criado_em)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,'painel',?)`,
    id, 'c1', 's1', prof, data, hora, duracao, valor, status,
    recebido >= valor ? 'pago' : recebido > 0 ? 'parcial' : 'aberto', recebido, data
  ));
  return id;
}

const ler = id => naEmpresa(() => db.db.get(
  'SELECT status, pag_status, pag_recebido, pag_presumido FROM appointments WHERE id=?', id));

const eventos = id => naEmpresa(() => db.db.all(
  'SELECT * FROM appointment_events WHERE appointment_id=? ORDER BY id', id));

const rodar = () => naEmpresa(fechar);

describe('passou da hora sem marcação: pendente, e não concluído', () => {
  test('dia anterior fica pendente, com o pagamento presumido e nada recebido', async () => {
    const id = await agendar({ data: '2020-01-10' });
    assert.equal(await rodar(), 1);

    const a = await ler(id);
    assert.equal(a.status, 'pendente');
    assert.equal(a.pag_presumido, 1);
    assert.equal(Number(a.pag_recebido), 0, 'o recebido é só o que alguém registrou');
    assert.equal(a.pag_status, 'aberto');
  });

  test('quem já tinha pagado tudo não tem o que presumir', async () => {
    const id = await agendar({ data: '2020-01-10', recebido: 100 });
    await rodar();
    const a = await ler(id);
    assert.equal(a.status, 'pendente', 'pagar não é ter vindo');
    assert.equal(a.pag_presumido, 0);
  });

  test('o corte é o FIM do atendimento, não o começo', async () => {
    const h = hoje();
    const [hh, mm] = agora().split(':').map(Number);
    const emMinutos = hh * 60 + mm;
    const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

    if (emMinutos < 120 || emMinutos > 22 * 60) return;   // perto da virada, sem margem

    const terminou = await agendar({ data: h, hora: hhmm(emMinutos - 90), duracao: 30 });
    const emCurso = await agendar({ data: h, hora: hhmm(emMinutos - 30), duracao: 120 });

    await rodar();
    assert.equal((await ler(terminou)).status, 'pendente', 'acabou há uma hora');
    assert.equal((await ler(emCurso)).status, 'agendado', 'ainda está acontecendo');
  });

  test('não mexe em quem já foi resolvido à mão', async () => {
    const falta = await agendar({ data: '2020-01-10', hora: '10:00', status: 'falta' });
    const cancelado = await agendar({ data: '2020-01-10', hora: '11:00', status: 'cancelado' });
    const feito = await agendar({ data: '2020-01-10', hora: '12:00', status: 'concluido' });

    await rodar();
    assert.equal((await ler(falta)).status, 'falta');
    assert.equal((await ler(cancelado)).status, 'cancelado');
    assert.equal((await ler(feito)).status, 'concluido');
  });

  test('rodar duas vezes não conta duas vezes', async () => {
    await agendar({ data: '2020-01-10' });
    assert.equal(await rodar(), 1);
    assert.equal(await rodar(), 0, 'pendente não volta a ser fechado');
  });

  test('a passagem fica no histórico como sistema, e no registro', async () => {
    const id = await agendar({ data: '2020-01-10' });
    // Pelo GET de quem abre o painel: o fechamento roda ali dentro, logado.
    await dona('GET', '/api/estado');

    const ev = (await eventos(id)).at(-1);
    assert.deepEqual([ev.status_antes, ev.status_depois], ['agendado', 'pendente']);
    assert.equal(ev.autor_tipo, 'sistema', 'não é a dona que abriu o painel');
    assert.equal(ev.origem, 'fechamento');

    const log = await naEmpresa(() => db.db.get(
      `SELECT usuario_nome, user_id FROM logs WHERE acao='agendamento.pendente' ORDER BY id DESC LIMIT 1`));
    assert.equal(log.user_id, null);
    assert.equal(log.usuario_nome, 'sistema');
  });
});

describe('"Sim, todos vieram"', () => {
  test('três dias de pendência acumulada viram concluídos de uma vez', async () => {
    // Segunda, terça e quarta sem ninguém marcar nada: é o caso de quem não
    // abriu o painel na semana. O aviso junta todos, e um toque resolve.
    const h = hoje();
    const dias = [addDias(h, -3), addDias(h, -2), addDias(h, -1)];
    const ids = [];
    for (const d of dias) {
      ids.push(await agendar({ data: d, hora: '09:00' }));
      ids.push(await agendar({ data: d, hora: '14:00' }));
    }
    await rodar();
    for (const id of ids) assert.equal((await ler(id)).status, 'pendente');

    const r = await dona('POST', '/api/agendamentos/confirmar-presenca', { ids });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.confirmados, 6);

    for (const id of ids) {
      const a = await ler(id);
      assert.equal(a.status, 'concluido');
      assert.equal(a.pag_presumido, 1, 'presença não é pagamento: segue presumido');
      assert.equal(Number(a.pag_recebido), 0);

      const ev = (await eventos(id)).at(-1);
      assert.deepEqual([ev.status_antes, ev.status_depois], ['pendente', 'concluido']);
      assert.equal(ev.autor_tipo, 'equipe');
      assert.equal(ev.autor_nome, 'Dona');
    }

    const log = await naEmpresa(() => db.db.get(
      `SELECT detalhe FROM logs WHERE acao='agendamento.presenca_em_lote' ORDER BY id DESC LIMIT 1`));
    assert.deepEqual(log.detalhe.dias, dias, 'o registro diz de quais dias');
  });

  test('só confirma o que o aviso mostrou', async () => {
    // Passou da hora entre a tela carregar e o toque: ninguém viu, não entra.
    const visto = await agendar({ data: '2020-01-10', hora: '09:00' });
    const depois = await agendar({ data: '2020-01-10', hora: '10:00' });
    await rodar();

    await dona('POST', '/api/agendamentos/confirmar-presenca', { ids: [visto] });
    assert.equal((await ler(visto)).status, 'concluido');
    assert.equal((await ler(depois)).status, 'pendente');
  });

  test('só mexe no que está pendente', async () => {
    const falta = await agendar({ data: '2020-01-10', status: 'falta' });
    const futuro = await agendar({ data: '2099-01-10' });
    const r = await dona('POST', '/api/agendamentos/confirmar-presenca', { ids: [falta, futuro] });
    assert.equal(r.corpo.confirmados, 0);
    assert.equal((await ler(falta)).status, 'falta', 'falta marcada não vira presença');
    assert.equal((await ler(futuro)).status, 'agendado', 'o de amanhã não "veio"');
  });

  test('a funcionária confirma só os dela, mesmo mandando os da colega', async () => {
    const dela = await agendar({ data: '2020-01-10', prof: 'p1' });
    const daColega = await agendar({ data: '2020-01-10', hora: '10:00', prof: 'p2' });
    await rodar();

    const r = await ana('POST', '/api/agendamentos/confirmar-presenca', { ids: [dela, daColega] });
    assert.equal(r.corpo.confirmados, 1);
    assert.equal((await ler(daColega)).status, 'pendente', 'escopoDe vale para escrever também');
  });

  test('pedido vazio é recusado', async () => {
    const r = await dona('POST', '/api/agendamentos/confirmar-presenca', {});
    assert.equal(r.status, 400);
  });
});

describe('"Alguém faltou": uma a uma', () => {
  test('marcar falta num pendente tira o presumido e fica no histórico', async () => {
    const id = await agendar({ data: '2020-01-10' });
    await rodar();
    await dona('PUT', `/api/agendamentos/${id}`, { status: 'falta' });

    const a = await ler(id);
    assert.equal(a.status, 'falta');
    assert.equal(a.pag_presumido, 0, 'quem não veio não pagou no balcão');

    const ev = (await eventos(id)).at(-1);
    assert.deepEqual([ev.status_antes, ev.status_depois], ['pendente', 'falta']);
    assert.equal(ev.autor_nome, 'Dona');

    const log = await naEmpresa(() => db.db.get(
      `SELECT acao FROM logs WHERE alvo_id=? ORDER BY id DESC LIMIT 1`, id));
    assert.equal(log.acao, 'agendamento.falta');
  });
});

describe('o caixa em duas linhas', () => {
  const DIA = '2020-01-10';
  const resumo = async () => (await dona('GET', `/api/relatorios/resumo?de=${DIA}&ate=${DIA}`)).corpo;

  test('presumido fica fora do recebido até alguém registrar', async () => {
    const id = await agendar({ data: DIA, valor: 100 });
    const comEntrada = await agendar({ data: DIA, hora: '11:00', valor: 80, recebido: 30 });
    await rodar();

    let r = await resumo();
    assert.equal(r.recebido, 0, 'nada confirmado: só a entrada de pendente, que ainda não é atendimento');
    assert.equal(r.presumido, 150, '100 inteiros + os 50 que faltavam da entrada');
    assert.equal(r.pendentes, 2);
    assert.equal(r.aReceber, 0, 'presumido não é dívida');

    // Confirmar a presença: vira atendimento, mas o dinheiro segue estimado.
    await dona('POST', '/api/agendamentos/confirmar-presenca', { ids: [id, comEntrada] });
    r = await resumo();
    assert.equal(r.atendimentos, 2);
    assert.equal(r.recebido, 30, 'a entrada registrada passa a contar');
    assert.equal(r.presumido, 150, 'confirmar a presença não confirma o dinheiro');

    // Registrar o pagamento: sai do estimado e entra no confirmado.
    await dona('PUT', `/api/agendamentos/${id}`, { pagamento: { recebido: 100, forma: 'pix' } });
    r = await resumo();
    assert.equal(r.recebido, 130);
    assert.equal(r.presumido, 50);
    assert.equal((await ler(id)).pag_presumido, 0);
  });

  test('falta e cancelado não entram no estimado', async () => {
    const a = await agendar({ data: DIA });
    const b = await agendar({ data: DIA, hora: '11:00' });
    await rodar();
    await dona('PUT', `/api/agendamentos/${a}`, { status: 'falta' });
    await dona('PUT', `/api/agendamentos/${b}`, { status: 'cancelado' });
    const r = await resumo();
    assert.equal(r.presumido, 0);
    assert.equal(r.faltas, 1);
  });
});
