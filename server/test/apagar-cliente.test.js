import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, cenario, agendar, subirApi, criarEquipe } from './ambiente.js';

/**
 * Apagar a cliente é o pedido de exclusão da LGPD (migration 040).
 *
 * Três coisas que a ficha sumindo sozinha não resolvia: a FK de `messages`
 * derrubava o DELETE de quem já tinha recebido mensagem (erro 500, sem
 * explicação); as mensagens e conversas ficavam com nome e telefone dela;
 * e `appointment_events` seguia ligando os atendimentos da pessoa entre si
 * por um id que era só dela.
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

const na = fn => db.db.comEmpresa('default', fn);

const criarCliente = async (nome, fone) => {
  const r = await dona('POST', '/api/clientes', { nome, fone });
  assert.equal(r.status, 201);
  return r.corpo.id;
};

describe('apagar a cliente apaga o rastro', () => {
  test('quem já recebeu mensagem pode ser apagada — e a mensagem vai junto', async () => {
    const id = await criarCliente('Apagada Com Mensagem', '47960000001');
    // Uma mensagem já enviada, como o lembrete deixa: carrega nome e telefone.
    await na(() => db.db.run(
      `INSERT INTO messages (id, client_id, template_chave, fone, texto, status,
                             agendado_para, enviado_em, provider, criado_em)
       VALUES ('m-apagar-1', ?, 'lembrete_dia', '47960000001', 'Oi, Apagada! Amanhã às 10h.',
               'enviado', '2026-01-01 08:00', '2026-01-01 08:00', 'manual', '2026-01-01')`, id));

    const r = await dona('DELETE', `/api/clientes/${id}`);
    assert.equal(r.status, 200, JSON.stringify(r.corpo));

    await na(async () => {
      assert.equal(await db.db.get('SELECT 1 FROM clients WHERE id=?', id), undefined);
      assert.equal(await db.db.get('SELECT 1 FROM messages WHERE client_id=?', id), undefined,
        'a mensagem guardava o nome e o telefone de quem pediu para sair');
    });
  });

  test('o histórico fica para a contagem, mas sem o fio que levava à pessoa', async () => {
    const id = await criarCliente('Apagada Com História', '47960000002');
    const agendamento = `a-${DIA}-09:30-p1`;
    await na(() => agendar(db, { prof: 'p1', data: DIA, hora: '09:30', cliente: id }));

    // Com agendamento de pé, a rota recusa — o histórico sai primeiro.
    const cedo = await dona('DELETE', `/api/clientes/${id}`);
    assert.equal(cedo.status, 409);

    await na(() => db.db.run('DELETE FROM appointments WHERE id=?', agendamento));

    const r = await dona('DELETE', `/api/clientes/${id}`);
    assert.equal(r.status, 200, JSON.stringify(r.corpo));

    await na(async () => {
      // Pela cliente, não pelo id do agendamento: `appointment_events` não se
      // apaga nunca (031), então sobram eventos de outros arquivos de teste.
      assert.equal((await db.db.all('SELECT 1 FROM appointment_events WHERE client_id=?', id)).length, 0,
        'nenhum evento pode seguir apontando para quem pediu para sair');
      const doAgendamento = await db.db.all(
        'SELECT evento FROM appointment_events WHERE appointment_id=?', agendamento);
      assert.ok(doAgendamento.length >= 2, 'criado e apagado continuam contáveis, agora sem dono');
    });
  });

  test('as conversas do WhatsApp dela vão junto', async () => {
    const id = await criarCliente('Apagada Com Conversa', '47960000003');
    await na(async () => {
      await db.db.run(
        `INSERT INTO conversas (id, canal, fone) VALUES ('cv-apagar', 'whatsapp', '47960000003')`);
      await db.db.run(
        `INSERT INTO conversa_mensagens (id, conversa_id, autor, texto)
         VALUES ('cm-apagar', 'cv-apagar', 'cliente', 'oi, queria remarcar')`);
    });

    const r = await dona('DELETE', `/api/clientes/${id}`);
    assert.equal(r.status, 200);

    await na(async () => {
      assert.equal(await db.db.get(`SELECT 1 FROM conversas WHERE fone='47960000003'`), undefined);
      assert.equal(await db.db.get(`SELECT 1 FROM conversa_mensagens WHERE id='cm-apagar'`), undefined,
        'o texto da conversa é dado pessoal tanto quanto a ficha');
    });
  });

  test('a função do rastro não roda sem empresa marcada na transação', async () => {
    // SECURITY DEFINER atravessa o RLS; a empresa vem da transação, nunca de
    // argumento. Sem empresa, recusar é a única resposta segura.
    await assert.rejects(
      db.db.get(`SELECT plataforma.apagar_rastro_da_cliente('qualquer')`),
      /empresa/
    );
  });
});
