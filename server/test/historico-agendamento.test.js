import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  prepararBanco, limpar, limparAgenda, cenario, subirApi, criarEquipe,
  criarEmpresa, apagarEmpresa,
} from './ambiente.js';

/**
 * O histórico do agendamento (migration 031) e o que deixou de se perder.
 *
 * O que se prova aqui é o que a linha de `appointments` sozinha não conta:
 * quem cancelou e quando, de onde o horário foi remarcado, o que o relógio
 * presumiu e o que alguém marcou — e que apagar um horário não leva junto a
 * ficha de saúde nem o que já foi dito à cliente.
 */

const DIA = '2027-03-05';
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

beforeEach(async () => {
  await db.db.comEmpresa('default', () => limparAgenda(db));
});

const naEmpresa = fn => db.db.comEmpresa('default', fn);

/** Direto no banco: o motor recusaria o passado, e aqui o passado é o caso. */
async function agendar({ data = DIA, hora = '10:00', status = 'agendado' } = {}) {
  const id = 'h' + Math.random().toString(36).slice(2, 10);
  await naEmpresa(() => db.db.run(
    `INSERT INTO appointments (id,client_id,service_id,staff_id,data,hora,duracao,valor,status,origem,criado_em)
     VALUES (?,?,?,?,?,?,?,?,?,'painel',?)`,
    id, 'c1', 's1', 'p1', data, hora, 60, 100, status, '2026-01-01 10:00'
  ));
  return id;
}

const eventos = id => naEmpresa(() => db.db.all(
  'SELECT * FROM appointment_events WHERE appointment_id=? ORDER BY id', id));

describe('cada mudança vira evento, com autor', () => {
  test('cancelar pelo painel guarda quem, quando e de onde para onde', async () => {
    const id = await agendar();
    const r = await dona('PUT', `/api/agendamentos/${id}`, { status: 'cancelado' });
    assert.equal(r.status, 200);

    const ev = (await eventos(id)).at(-1);
    assert.equal(ev.evento, 'alterado');
    assert.equal(ev.status_antes, 'agendado');
    assert.equal(ev.status_depois, 'cancelado');
    assert.equal(ev.autor_tipo, 'equipe');
    assert.equal(ev.autor_nome, 'Dona', 'nome congelado, como em logs');
    assert.equal(ev.origem, 'painel');
    assert.ok(ev.criado_em instanceof Date, 'instante absoluto, para medir antecedência');
  });

  test('remarcar guarda o horário de onde saiu', async () => {
    const id = await agendar({ hora: '10:00' });
    await dona('PUT', `/api/agendamentos/${id}`, { data: '2027-03-06', hora: '14:00' });

    const ev = (await eventos(id)).at(-1);
    assert.deepEqual([ev.data_antes, ev.hora_antes], [DIA, '10:00'],
      'a linha de appointments já não sabe disso');
    assert.deepEqual([ev.data_depois, ev.hora_depois], ['2027-03-06', '14:00']);
  });

  test('receber pagamento não é percurso e não vira evento', async () => {
    const id = await agendar();
    const antes = (await eventos(id)).length;
    await dona('PUT', `/api/agendamentos/${id}`, { pagamento: { recebido: 50, forma: 'pix' } });
    assert.equal((await eventos(id)).length, antes);
  });

  test('agendamento do site é da cliente, mesmo sem ninguém logado', async () => {
    const r = await api.anonimo()('POST', '/api/publico/agendar', {
      nome: 'Cliente Site', fone: '47988881111', nascimento: '1990-05-10',
      servicoId: 's1', profissionalId: 'p1', data: DIA, hora: '15:00',
    });
    assert.equal(r.status, 201);

    const [ev] = await eventos(r.corpo.agendamento.id);
    assert.equal(ev.evento, 'criado');
    assert.equal(ev.autor_tipo, 'cliente');
    assert.equal(ev.origem, 'site');
  });

  test('o fechamento automático assina como sistema, não como quem abriu o painel', async () => {
    const id = await agendar({ data: '2020-01-10' });
    // O fechamento roda dentro do GET de quem abre o painel — logado como Dona.
    await dona('GET', '/api/estado');

    const ev = (await eventos(id)).at(-1);
    assert.equal(ev.status_depois, 'pendente', 'desde a 034 o relógio não conclui ninguém');
    assert.equal(ev.autor_tipo, 'sistema');
    assert.equal(ev.origem, 'fechamento');

    // E a correção depois volta a ser da Dona: a marca do relógio não vazou.
    await dona('PUT', `/api/agendamentos/${id}`, { status: 'falta' });
    const correcao = (await eventos(id)).at(-1);
    assert.equal(correcao.autor_tipo, 'equipe');
    assert.deepEqual([correcao.status_antes, correcao.status_depois], ['pendente', 'falta']);
  });

  test('a marca temporária volta ao que era', async () => {
    await naEmpresa(async () => {
      await db.db.comAutoria({ tipo: 'equipe', id: 'u1', nome: 'Fulana', origem: 'painel' });
      await db.db.comAutoria({ tipo: 'sistema', origem: 'fechamento' }, async () => {});
      const id = 'h' + Math.random().toString(36).slice(2, 10);
      await db.db.run(
        `INSERT INTO appointments (id,client_id,service_id,staff_id,data,hora,duracao,valor,criado_em)
         VALUES (?,?,?,?,?,?,?,?,?)`, id, 'c1', 's1', 'p1', DIA, '17:00', 60, 100, '2026-01-01');
      const [ev] = await db.db.all('SELECT autor_tipo, autor_nome FROM appointment_events WHERE appointment_id=?', id);
      assert.deepEqual([ev.autor_tipo, ev.autor_nome], ['equipe', 'Fulana']);
    });
  });

  test('a aplicação não reescreve nem apaga o histórico', async () => {
    const id = await agendar();
    // Pelo código, e não pela frase: o servidor responde no idioma dele.
    const semPermissao = { code: '42501' };
    await assert.rejects(naEmpresa(() => db.db.run(
      `UPDATE appointment_events SET status_depois='x' WHERE appointment_id=?`, id)), semPermissao);
    await assert.rejects(naEmpresa(() => db.db.run(
      'DELETE FROM appointment_events WHERE appointment_id=?', id)), semPermissao);
  });
});

describe('apagar um horário não apaga o que precisa ficar', () => {
  test('o evento, a ficha de saúde e a mensagem enviada sobrevivem', async () => {
    const id = await agendar();
    await naEmpresa(async () => {
      await db.db.run(
        `INSERT INTO forms (id, nome, criado_em) VALUES ('f-hist', 'Anamnese', '2026-01-01') ON CONFLICT DO NOTHING`);
      await db.db.run(
        `INSERT INTO form_answers (id, form_id, appointment_id, client_id, respostas, criado_em)
         VALUES (?, 'f-hist', ?, 'c1', '[]', '2026-01-01')`, 'r-' + id, id);
      await db.db.run(
        `INSERT INTO messages (id, client_id, appointment_id, template_chave, fone, texto, status, agendado_para, criado_em)
         VALUES (?, 'c1', ?, 'confirmacao', '47900000001', 'oi', 'enviado', '2026-01-01 10:00', '2026-01-01')`,
        'm-' + id, id);
    });

    const r = await dona('DELETE', `/api/agendamentos/${id}`);
    assert.equal(r.status, 200);

    const apagado = (await eventos(id)).at(-1);
    assert.equal(apagado.evento, 'apagado');
    assert.equal(apagado.status_antes, 'agendado');
    assert.equal(apagado.autor_nome, 'Dona');

    const ficha = await naEmpresa(() => db.db.get('SELECT appointment_id FROM form_answers WHERE id=?', 'r-' + id));
    assert.ok(ficha, 'a anamnese é registro que não se apaga por tabela');
    assert.equal(ficha.appointment_id, null);

    const msg = await naEmpresa(() => db.db.get('SELECT appointment_id FROM messages WHERE id=?', 'm-' + id));
    assert.ok(msg, 'o que foi dito à cliente continua no histórico');
    assert.equal(msg.appointment_id, null);
  });
});

describe('o banco recusa o que a rota deixava passar', () => {
  test('status fora da lista não entra', async () => {
    await assert.rejects(agendar({ status: 'concluído' }), /status_valido/);
  });

  test('trocar para a cliente de outra empresa é recusado', async () => {
    // Sorteado: se a recusa quebrar, o agendamento passa a apontar para a
    // cliente de fora, a limpeza não consegue apagá-la, e um nome fixo faria a
    // rodada seguinte falhar por outro motivo.
    const sufixo = Math.random().toString(36).slice(2, 8);
    const outra = `hist-${sufixo}`, deFora = `hist-c-${sufixo}`;
    await criarEmpresa(db, { id: outra, slug: outra, nome: 'Outra' });
    const id = await agendar();
    try {
      await db.db.comEmpresa(outra, () => db.db.run(
        `INSERT INTO clients (id,nome,fone,criado_em) VALUES (?,'De Fora','47911112222','2026-01-01')`, deFora));
      const r = await dona('PUT', `/api/agendamentos/${id}`, { clienteId: deFora });
      assert.equal(r.status, 404, 'a chave estrangeira sozinha aceitaria — a checagem dela ignora o RLS');
      const a = await naEmpresa(() => db.db.get('SELECT client_id FROM appointments WHERE id=?', id));
      assert.equal(a.client_id, 'c1');
    } finally {
      await naEmpresa(() => db.db.run('DELETE FROM appointments WHERE id=?', id));
      await apagarEmpresa(outra);
    }
  });
});

describe('o banco conta o dia no fuso da agenda', () => {
  test('"hoje" no SQL é o mesmo "hoje" do código', async () => {
    const { hoje, fuso } = await import('../src/lib/dates.js');
    const r = await naEmpresa(() => db.db.get(
      `SELECT current_setting('TimeZone') AS tz, to_char(now(), 'YYYY-MM-DD') AS dia`));
    assert.equal(r.tz, fuso());
    assert.equal(r.dia, hoje());
  });
});

describe('a cliente apagada não fica no registro', () => {
  test('sem telefone e só com o primeiro nome', async () => {
    const r = await dona('POST', '/api/clientes', { nome: 'Joana da Silva', fone: '47955554444' });
    assert.equal(r.status, 201);
    await dona('DELETE', `/api/clientes/${r.corpo.id}`);

    const log = await naEmpresa(() => db.db.get(
      `SELECT resumo, detalhe FROM logs WHERE acao='cliente.apagado' AND alvo_id=?`, r.corpo.id));
    assert.equal(log.resumo, 'apagou a ficha de Joana');
    assert.doesNotMatch(JSON.stringify(log.detalhe), /47955554444/);
  });
});

describe('visita é atendimento concluído', () => {
  test('falta e horário futuro não contam como visita', async () => {
    await agendar({ data: '2020-01-10', status: 'concluido' });
    await agendar({ data: '2020-02-10', status: 'falta' });
    await agendar({ data: '2027-03-05', status: 'agendado' });

    const { corpo } = await dona('GET', '/api/clientes/c1');
    assert.equal(corpo.visitas, 1);
    assert.equal(corpo.faltas, 1);
    assert.equal(corpo.ultimaVisita, '2020-01-10', 'o dia da falta não é a última visita');
  });
});
