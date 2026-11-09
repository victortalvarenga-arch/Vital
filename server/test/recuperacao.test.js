import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, limparAgenda, cenario, subirApi, criarEquipe, agendar } from './ambiente.js';

/**
 * A aba Recuperação: quem faz tempo que não volta (migration 036).
 *
 * É uma lista para consultar, com envio opcional. O que estes testes seguram é
 * quem aparece nela — chamar de "sumida" quem tem horário marcado é a mensagem
 * errada para a pessoa certa — e o consentimento, que continua valendo mesmo
 * com alguém apertando o botão.
 */

let db, api, dona, ana, datas;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  datas = await import('../src/lib/dates.js');
  const { prepararEmpresaPadrao } = await import('../src/lib/provisionar.js');
  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
  });
  await prepararEmpresaPadrao('default');
  ({ dono: dona, ana } = await criarEquipe(api));
});

after(async () => {
  await api.fechar();
  await db.pool.end();
});

beforeEach(async () => {
  await na(async () => {
    await limparAgenda(db);
    await db.setConfig({ diasReativacao: 60 });
    await db.db.run(`UPDATE clients SET optin = 1`);
  });
});

const na = fn => db.db.comEmpresa('default', fn);
const dia = n => datas.addDias(datas.hoje(), n);
const lista = async () => (await dona('GET', '/api/mensagens/recuperacao')).corpo;
const ids = async () => (await lista()).itens.map(c => c.id);

describe('quem aparece na lista', () => {
  test('quem passou do prazo aparece, com a última visita e há quantos dias', async () => {
    await na(async () => {
      await agendar(db, { data: dia(-100), hora: '10:00', status: 'concluido' });
      await agendar(db, { data: dia(-70), hora: '10:00', status: 'concluido' });
    });
    const { prazo, itens: [c] } = await lista();
    assert.equal(prazo, 60);
    assert.equal(c.id, 'c1');
    assert.equal(c.ultimaVisita, dia(-70));
    assert.equal(c.dias, 70);
    assert.equal(c.visitas, 2);
    assert.equal(c.ultimoServico, 'Corte');
  });

  test('quem veio dentro do prazo não aparece', async () => {
    await na(() => agendar(db, { data: dia(-59), hora: '10:00', status: 'concluido' }));
    assert.deepEqual(await ids(), []);
  });

  test('sem limite de tempo: quem sumiu há muito continua na lista', async () => {
    await na(() => agendar(db, { data: dia(-400), hora: '10:00', status: 'concluido' }));
    assert.deepEqual(await ids(), ['c1']);
  });

  test('quem tem horário marcado não aparece', async () => {
    await na(async () => {
      await agendar(db, { data: dia(-100), hora: '10:00', status: 'concluido' });
      await agendar(db, { data: dia(5), hora: '10:00' });
    });
    assert.deepEqual(await ids(), []);
  });

  test('horário cancelado não conta como volta', async () => {
    await na(async () => {
      await agendar(db, { data: dia(-100), hora: '10:00', status: 'concluido' });
      await agendar(db, { data: dia(5), hora: '10:00', status: 'cancelado' });
    });
    assert.deepEqual(await ids(), ['c1']);
  });

  test('atendimento sem marcação conta como visita; falta, não', async () => {
    await na(async () => {
      await agendar(db, { data: dia(-100), hora: '10:00', status: 'concluido' });
      await agendar(db, { data: dia(-3), hora: '10:00', status: 'pendente' });
    });
    assert.deepEqual(await ids(), [], 'pendente quase sempre é quem veio');

    await na(() => db.db.run(`UPDATE appointments SET status = 'falta' WHERE data = ?`, dia(-3)));
    assert.deepEqual(await ids(), ['c1']);
  });

  test('quem nunca foi atendida não aparece', async () => {
    assert.deepEqual(await ids(), []);
  });

  test('quem saiu há menos tempo vem primeiro', async () => {
    await na(async () => {
      await db.db.run(`INSERT INTO clients (id,nome,fone,optin,criado_em) VALUES ('c2','Bruna','47900000002',1,'2026-01-01')`);
      await agendar(db, { data: dia(-200), hora: '10:00', status: 'concluido' });
      await agendar(db, { data: dia(-70), hora: '10:00', status: 'concluido', prof: 'p2', cliente: 'c2', servico: 's1' });
    });
    assert.deepEqual(await ids(), ['c2', 'c1']);
    await na(async () => {
      await limparAgenda(db);
      await db.db.run(`DELETE FROM clients WHERE id = 'c2'`);
    });
  });
});

describe('chamar de volta', () => {
  test('no modo manual devolve o link e fica registrado na lista', async () => {
    await na(() => agendar(db, { data: dia(-70), hora: '10:00', status: 'concluido' }));
    const r = await dona('POST', '/api/mensagens/recuperacao/c1/enviar');
    assert.equal(r.status, 200);
    assert.match(r.corpo.link, /^https:\/\/wa\.me\//);
    assert.match(decodeURIComponent(r.corpo.link), /70 dias/);
    assert.match(decodeURIComponent(r.corpo.link), /Corte/);

    const { itens: [c] } = await lista();
    assert.ok(c.chamadaEm.startsWith(datas.hoje()));
  });

  test('tocar de novo reabre o link sem duplicar o registro', async () => {
    await na(() => agendar(db, { data: dia(-70), hora: '10:00', status: 'concluido' }));
    await dona('POST', '/api/mensagens/recuperacao/c1/enviar');
    assert.equal((await dona('POST', '/api/mensagens/recuperacao/c1/enviar')).status, 200);
    const n = await na(() => db.db.all(`SELECT id FROM messages WHERE template_chave = 'reativacao'`));
    assert.equal(n.length, 1);
  });

  test('sem opt-in a cliente aparece, mas o envio é recusado', async () => {
    // LGPD: o botão apertado por alguém não vira consentimento dela.
    await na(async () => {
      await agendar(db, { data: dia(-70), hora: '10:00', status: 'concluido' });
      await db.db.run(`UPDATE clients SET optin = 0`);
    });
    const { itens: [c] } = await lista();
    assert.equal(c.optin, false);
    assert.equal((await dona('POST', '/api/mensagens/recuperacao/c1/enviar')).status, 409);
  });

  test('nada disso entra na fila', async () => {
    await na(() => agendar(db, { data: dia(-70), hora: '10:00', status: 'concluido' }));
    await dona('POST', '/api/mensagens/recuperacao/c1/enviar');
    assert.deepEqual((await dona('GET', '/api/mensagens/fila')).corpo.itens, []);
  });
});

describe('quem pode', () => {
  test('a profissional não vê nem envia: a lista é da empresa inteira', async () => {
    assert.equal((await ana('GET', '/api/mensagens/recuperacao')).status, 403);
    assert.equal((await ana('POST', '/api/mensagens/recuperacao/c1/enviar')).status, 403);
  });
});

describe('a fila pela API', () => {
  const vencida = () => na(() => db.db.run(
    `INSERT INTO messages (id,client_id,template_chave,fone,texto,agendado_para,expira_em,criado_em)
     VALUES ('m-velha','c1','lembrete_dia','47900000001','oi','2020-01-01 08:00','2020-01-01 10:00','2020-01-01')`
  ));

  test('a mensagem vencida não aparece, mesmo antes de o cron passar', async () => {
    await vencida();
    assert.deepEqual((await dona('GET', '/api/mensagens/fila')).corpo.itens, []);
  });

  test('e enviar a partir de uma tela antiga é recusado', async () => {
    await vencida();
    assert.equal((await dona('POST', '/api/mensagens/fila/m-velha/enviar')).status, 409);
    const m = await na(() => db.db.get(`SELECT status FROM messages WHERE id = 'm-velha'`));
    assert.equal(m.status, 'expirado');
  });
});
