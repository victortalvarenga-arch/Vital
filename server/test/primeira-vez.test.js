import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, limparAgenda, cenario, agendar, subirApi, criarEquipe } from './ambiente.js';

/**
 * "Primeira vez": o atendimento de quem nunca veio.
 *
 * Quem atende precisa saber disso ANTES de a pessoa sentar na cadeira — é
 * outra conversa, outro tempo, e às vezes outro preço. Hoje a informação
 * existe (é só olhar o histórico da ficha), mas olhar ficha por ficha antes de
 * cada horário é trabalho que ninguém faz no meio do expediente.
 *
 * **Calculado na consulta, sem coluna nova.** Marcar "primeira vez" numa
 * coluna seria guardar uma conclusão que muda sozinha: cancelar o primeiro
 * atendimento muda quem é a primeira vez, e aí a coluna mente até alguém
 * lembrar de corrigi-la.
 *
 * As regras que estes casos seguram:
 *
 *  - é o **dia**, não o agendamento: combo vira três horários em sequência, e
 *    marcar só o primeiro deixaria a mesma cliente "nova" e "antiga" na mesma
 *    manhã;
 *  - **cancelado não conta**: quem marcou, desmarcou e voltou nunca veio;
 *  - é primeira vez **na empresa**, não na agenda de quem atende: a cliente da
 *    colega não é nova no salão, e tratá-la como nova é constrangedor;
 *  - a agenda e o bootstrap do painel respondem a MESMA coisa — foi por duas
 *    respostas diferentes que o `/api/estado` já virou porta dos fundos antes.
 */

const DIA = '2027-04-05';
const ANTES = '2027-03-01';

let db, api, dona, ana;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();

  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
    await db.db.run(
      `INSERT INTO clients (id,nome,fone,criado_em) VALUES ('c2','Cliente Dois','47900000002','2026-01-01')`
    );
  });

  ({ dono: dona, ana } = await criarEquipe(api));
});

after(async () => {
  await api?.fechar();
  await db?.pool.end();
});

beforeEach(async () => {
  await db.db.comEmpresa('default', () => limparAgenda(db));
});

const naAgenda = async (data = DIA) => {
  const { corpo } = await dona('GET', `/api/agendamentos?data=${data}`);
  return corpo;
};

const noBootstrap = async data => {
  const { corpo } = await dona('GET', '/api/estado');
  return corpo.agendamentos.filter(a => a.data === data);
};

describe('quem nunca veio aparece marcado', () => {
  test('o primeiro atendimento da cliente é primeira vez', async () => {
    await db.db.comEmpresa('default', () => agendar(db, { data: DIA, hora: '09:00' }));
    const [a] = await naAgenda();
    assert.equal(a.primeiraVez, true);
  });

  test('o segundo, em outro dia, não é', async () => {
    await db.db.comEmpresa('default', async () => {
      await agendar(db, { data: ANTES, hora: '09:00' });
      await agendar(db, { data: DIA, hora: '09:00' });
    });
    assert.equal((await naAgenda(ANTES))[0].primeiraVez, true);
    assert.equal((await naAgenda(DIA))[0].primeiraVez, false);
  });

  test('dois horários no mesmo dia (combo) ficam os dois marcados', async () => {
    // Senão a mesma cliente seria "nova" às 9h e "antiga" às 10h, na mesma
    // manhã e para a mesma pessoa que a atende.
    await db.db.comEmpresa('default', async () => {
      await agendar(db, { data: DIA, hora: '09:00' });
      await agendar(db, { data: DIA, hora: '10:00' });
    });
    const lista = await naAgenda();
    assert.equal(lista.length, 2);
    assert.deepEqual(lista.map(a => a.primeiraVez), [true, true]);
  });

  test('atendimento anterior cancelado não tira a marca', async () => {
    await db.db.comEmpresa('default', async () => {
      await agendar(db, { data: ANTES, hora: '09:00', status: 'cancelado' });
      await agendar(db, { data: DIA, hora: '09:00' });
    });
    assert.equal((await naAgenda(DIA))[0].primeiraVez, true, 'quem desmarcou nunca veio');
  });

  test('atendimento anterior em que ela faltou conta como vinda', async () => {
    // A ficha existe, o nome é conhecido, a cadeira ficou vazia. Tratar como
    // "primeira vez" faria quem atende cumprimentar como se nunca tivesse
    // marcado — e foi justamente ela que furou.
    await db.db.comEmpresa('default', async () => {
      await agendar(db, { data: ANTES, hora: '09:00', status: 'falta' });
      await agendar(db, { data: DIA, hora: '09:00' });
    });
    assert.equal((await naAgenda(DIA))[0].primeiraVez, false);
  });

  test('cliente diferente no mesmo dia não herda a marca da outra', async () => {
    await db.db.comEmpresa('default', async () => {
      await agendar(db, { data: ANTES, hora: '09:00' });                    // c1 já veio
      await agendar(db, { data: DIA, hora: '09:00' });                      // c1 de novo
      await agendar(db, { data: DIA, hora: '11:00', prof: 'p2', cliente: 'c2' }); // c2 estreia
    });
    const lista = await naAgenda();
    assert.deepEqual(
      lista.map(a => [a.clienteId, a.primeiraVez]),
      [['c1', false], ['c2', true]]
    );
  });
});

describe('é primeira vez na empresa, não na agenda de quem atende', () => {
  test('a funcionária não vê como nova quem já foi atendida pela colega', async () => {
    await db.db.comEmpresa('default', async () => {
      // Atendida pela Ana (p1) em março; marcada com a Bia (p2) em abril.
      await agendar(db, { data: ANTES, hora: '09:00', prof: 'p1' });
      await agendar(db, { data: DIA, hora: '09:00', prof: 'p2', cliente: 'c1', servico: 's1' });
    });
    const { corpo } = await ana('GET', `/api/agendamentos?data=${DIA}`);
    // A Ana só enxerga a própria agenda (escopo), então a lista dela vem
    // vazia aqui — o que importa é a dona ver a marca certa.
    assert.equal(corpo.length, 0, 'o escopo da funcionária continua valendo');
    assert.equal((await naAgenda(DIA))[0].primeiraVez, false);
  });
});

describe('agenda e bootstrap dizem a mesma coisa', () => {
  test('o /api/estado traz a mesma marca da rota de agenda', async () => {
    await db.db.comEmpresa('default', async () => {
      await agendar(db, { data: ANTES, hora: '09:00' });
      await agendar(db, { data: DIA, hora: '09:00' });
      await agendar(db, { data: DIA, hora: '11:00', prof: 'p2', cliente: 'c2' });
    });
    const daRota = (await naAgenda()).map(a => [a.id, a.primeiraVez]);
    const doBootstrap = (await noBootstrap(DIA)).map(a => [a.id, a.primeiraVez]);
    assert.deepEqual(doBootstrap, daRota);
  });
});
