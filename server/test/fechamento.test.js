import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, limparAgenda, cenario, subirApi, criarEquipe } from './ambiente.js';

/**
 * Fechamento automático: passou a hora, o atendimento conta.
 *
 * O que se testa aqui é o limite entre "já aconteceu" e "ainda vai
 * acontecer" — errar para um lado deixa o caixa parado, errar para o outro
 * cobra de quem ainda está na cadeira.
 *
 * E o caminho de volta: a atendente marca falta ou cancelado a qualquer
 * momento, e o dinheiro precisa sair do recebido junto.
 */

let db, api, dona, fechar, hoje, agora;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  // Depois de prepararBanco, senão o import estático prende o pool no banco
  // de trabalho — ver CLAUDE.md.
  ({ fecharAtendimentos: fechar } = await import('../src/jobs/fechamento.js'));
  ({ hoje, agora } = await import('../src/lib/dates.js'));
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

beforeEach(async () => {
  await db.db.comEmpresa('default', () => limparAgenda(db));
});

/** Agenda no dia/hora pedidos, direto no banco (o motor recusaria o passado). */
async function agendar({ data, hora, duracao = 60, status = 'agendado', valor = 100 }) {
  const id = 'a' + Math.random().toString(36).slice(2, 10);
  await db.db.comEmpresa('default', () => db.db.run(
    `INSERT INTO appointments (id,client_id,service_id,staff_id,data,hora,duracao,valor,status,pag_status,origem,criado_em)
     VALUES (?,?,?,?,?,?,?,?,?,'aberto','painel',?)`,
    id, 'c1', 's1', 'p1', data, hora, duracao, valor, status, data
  ));
  return id;
}

const ler = id => db.db.comEmpresa('default', () =>
  db.db.get('SELECT status, pag_status, pag_forma FROM appointments WHERE id=?', id));

const rodar = () => db.db.comEmpresa('default', fechar);

describe('o que já terminou vira atendimento feito', () => {
  test('dia anterior fecha inteiro, e entra como pago', async () => {
    const id = await agendar({ data: '2020-01-10', hora: '09:00' });
    assert.equal(await rodar(), 1);

    const a = await ler(id);
    assert.equal(a.status, 'concluido');
    assert.equal(a.pag_status, 'pago');
    // 'local' é o padrão da coluna e quer dizer "pago no balcão" — que é o
    // que de fato se sabe. Chutar pix ou cartão seria inventar dado.
    assert.equal(a.pag_forma, 'local');
  });

  test('o corte é o FIM do atendimento, não o começo', async () => {
    // Quem começou faz uma hora e ainda está na cadeira não pode virar caixa.
    const h = hoje();
    const [hh, mm] = agora().split(':').map(Number);
    const emMinutos = hh * 60 + mm;
    const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

    if (emMinutos < 120 || emMinutos > 22 * 60) return;   // perto da virada, sem margem

    const terminou = await agendar({ data: h, hora: hhmm(emMinutos - 90), duracao: 30 });
    const emCurso = await agendar({ data: h, hora: hhmm(emMinutos - 30), duracao: 120 });

    await rodar();
    assert.equal((await ler(terminou)).status, 'concluido', 'acabou há uma hora');
    assert.equal((await ler(emCurso)).status, 'agendado', 'ainda está acontecendo');
  });

  test('não mexe em quem já foi resolvido à mão', async () => {
    const falta = await agendar({ data: '2020-01-10', hora: '10:00', status: 'falta' });
    const cancelado = await agendar({ data: '2020-01-10', hora: '11:00', status: 'cancelado' });

    await rodar();
    assert.equal((await ler(falta)).status, 'falta');
    assert.equal((await ler(cancelado)).status, 'cancelado');
  });

  test('rodar duas vezes não conta duas vezes', async () => {
    await agendar({ data: '2020-01-10', hora: '09:00' });
    assert.equal(await rodar(), 1);
    assert.equal(await rodar(), 0, 'na segunda passada não sobra nada pendente');
  });

  test('deixa rastro no registro, como sistema e não como pessoa', async () => {
    await agendar({ data: '2020-01-10', hora: '09:00' });
    await rodar();

    const log = await db.db.comEmpresa('default', () => db.db.get(
      `SELECT usuario_nome, user_id, acao, resumo FROM logs
        WHERE acao='agendamento.fechado_automaticamente' ORDER BY id DESC LIMIT 1`));
    assert.ok(log, 'sem isto o dono veria faturamento aparecer sem autor');
    assert.equal(log.user_id, null);
    assert.equal(log.usuario_nome, 'sistema');
  });
});

describe('a atendente corrige, e o dinheiro sai junto', () => {
  const DIA = '2020-01-10';
  const resumo = () => dona('GET', `/api/relatorios/resumo?de=${DIA}&ate=${DIA}`);

  test('marcar falta tira do recebido e da divisão por forma', async () => {
    const id = await agendar({ data: DIA, hora: '09:00' });
    await rodar();

    const antes = await resumo();
    assert.equal(antes.corpo.recebido, 100, 'fechou e entrou no caixa');
    assert.equal(antes.corpo.porForma.reduce((n, f) => n + Number(f.total), 0), 100);

    await dona('PUT', `/api/agendamentos/${id}`, { status: 'falta' });

    const depois = await resumo();
    assert.equal(depois.corpo.recebido, 0, 'saiu do recebido');
    assert.equal(depois.corpo.faltas, 1);
    // O `pag_status` continua 'pago' — o que muda é o status. Se a divisão por
    // forma olhasse só o pagamento, ela discordaria do recebido logo acima.
    assert.equal(depois.corpo.porForma.reduce((n, f) => n + Number(f.total), 0), 0,
      'a divisão por forma acompanha o recebido');
  });

  test('cancelar libera o horário para outra cliente', async () => {
    const id = await agendar({ data: DIA, hora: '09:00' });
    await rodar();
    await dona('PUT', `/api/agendamentos/${id}`, { status: 'cancelado' });

    const livre = await db.db.comEmpresa('default', () => db.db.get(
      `SELECT COUNT(*) n FROM appointments
        WHERE staff_id='p1' AND data=? AND status IN ('agendado','confirmado','concluido')`, DIA));
    assert.equal(Number(livre.n), 0, 'cancelado não ocupa a agenda');
  });

  test('a correção fica no registro, com quem fez', async () => {
    const id = await agendar({ data: DIA, hora: '09:00' });
    await rodar();
    await dona('PUT', `/api/agendamentos/${id}`, { status: 'falta' });

    const { corpo } = await dona('GET', `/api/logs?alvoId=${id}`);
    const linha = corpo.find(l => l.acao.startsWith('agendamento.'));
    assert.ok(linha, 'o dono precisa conseguir ver quem desfez o fechamento');
    assert.equal(linha.usuario, 'Dona', 'com nome de gente, não "sistema"');
    assert.deepEqual(linha.detalhe.status, ['concluido', 'falta'],
      'e dizendo de onde para onde, senão não dá para auditar nada');
  });
});
