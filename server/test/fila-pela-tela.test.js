import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, limparAgenda, cenario, subirApi, criarEquipe, agendar } from './ambiente.js';
import { prazoDaMensagem } from '../../web/src/painel/prazo.js';

/**
 * O que a fila de WhatsApp diz para quem olha, e o que chega à cliente quando a
 * equipe mexe na agenda: o aviso de remarcação, o contexto de cada mensagem, a
 * vaga com dia e hora e o prazo da Recuperação.
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
const mensagens = chave => na(() => db.db.all(
  `SELECT status, texto, expira_em, dedupe_key FROM messages WHERE template_chave = ? ORDER BY criado_em`, chave
));
const id = (data, hora, prof = 'p1') => `a-${data}-${hora}-${prof}`;

describe('remarcar avisa a cliente', () => {
  const marcar = () => na(() => agendar(db, { data: dia(1), hora: '10:00' }));

  test('o aviso entra na fila com o dia e a hora novos', async () => {
    await marcar();
    const r = await dona('PUT', `/api/agendamentos/${id(dia(1), '10:00')}`, { data: dia(3), hora: '15:00' });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));

    const [m, ...resto] = await mensagens('remarcacao');
    assert.deepEqual(resto, []);
    assert.equal(m.status, 'pendente');
    assert.match(m.texto, /15:00/);
    assert.ok(m.texto.includes(datas.fmtData(dia(3))));
    assert.equal(m.expira_em, `${dia(3)} 15:00`);
  });

  test('o lembrete pendente do horário antigo sai', async () => {
    await marcar();
    await dona('POST', '/api/mensagens/fila/gerar');
    assert.equal((await mensagens('lembrete_vespera')).length, 1);

    await dona('PUT', `/api/agendamentos/${id(dia(1), '10:00')}`, { hora: '11:00' });
    assert.deepEqual(await mensagens('lembrete_vespera').then(l => l.filter(m => /10:00/.test(m.texto))), []);
  });

  test('lembrete que já tinha saído volta a sair no horário novo', async () => {
    // Era o buraco: a chave do lembrete é por agendamento, e o enviado segurava
    // a mesma chave para sempre.
    await marcar();
    await dona('POST', '/api/mensagens/fila/gerar');
    await na(() => db.db.run(`UPDATE messages SET status = 'enviado'`));

    await dona('PUT', `/api/agendamentos/${id(dia(1), '10:00')}`, { hora: '16:00' });
    await dona('POST', '/api/mensagens/fila/gerar');

    const lembretes = await mensagens('lembrete_vespera');
    assert.equal(lembretes.length, 2);
    assert.ok(lembretes.some(m => m.status === 'pendente' && /16:00/.test(m.texto)));
  });

  test('remarcar duas vezes deixa só o último aviso', async () => {
    await marcar();
    const caminho = `/api/agendamentos/${id(dia(1), '10:00')}`;
    await dona('PUT', caminho, { hora: '11:00' });
    await dona('PUT', caminho, { hora: '10:00' });
    const avisos = await mensagens('remarcacao');
    assert.equal(avisos.length, 1);
    assert.match(avisos[0].texto, /10:00/);
  });

  test('trocar só quem atende não avisa de remarcação', async () => {
    await marcar();
    await dona('PUT', `/api/agendamentos/${id(dia(1), '10:00')}`, { profissionalId: 'p2' });
    assert.deepEqual(await mensagens('remarcacao'), []);
  });

  test('cancelado no mesmo gesto não recebe aviso de horário novo', async () => {
    await marcar();
    await dona('PUT', `/api/agendamentos/${id(dia(1), '10:00')}`, { hora: '11:00', status: 'cancelado' });
    assert.deepEqual(await mensagens('remarcacao'), []);
  });

  test('sem o texto, ou com ele desligado, não quebra a remarcação', async () => {
    await marcar();
    await na(() => db.db.run(`UPDATE templates SET ativo = 0 WHERE chave = 'remarcacao'`));
    const r = await dona('PUT', `/api/agendamentos/${id(dia(1), '10:00')}`, { hora: '11:00' });
    assert.equal(r.status, 200);
    assert.deepEqual(await mensagens('remarcacao'), []);
    await na(() => db.db.run(`UPDATE templates SET ativo = 1 WHERE chave = 'remarcacao'`));
  });
});

describe('o contexto de cada mensagem', () => {
  const montar = async () => {
    await na(async () => {
      await agendar(db, { data: dia(-30), hora: '10:00', status: 'concluido', prof: 'p1' });
      await agendar(db, { data: dia(-9), hora: '10:00', status: 'concluido', prof: 'p2' });
      await agendar(db, { data: dia(1), hora: '10:00', prof: 'p1' });
    });
    await dona('POST', '/api/mensagens/fila/gerar');
  };
  const lembrete = async quem => (await quem('GET', '/api/mensagens/fila')).corpo.itens
    .find(m => m.templateChave === 'lembrete_vespera');

  test('traz a última visita, o que fez e com quem, e quando expira', async () => {
    await montar();
    const m = await lembrete(dona);
    assert.deepEqual(m.ultimaVisita, { data: dia(-9), servico: 'Corte', profissional: 'Bia' });
    assert.equal(m.expiraEm, `${dia(1)} 10:00`);
  });

  test('a profissional vê a última visita com ela, não com a colega', async () => {
    await montar();
    const m = await lembrete(ana);
    assert.deepEqual(m.ultimaVisita, { data: dia(-30), servico: 'Corte', profissional: 'Ana' });
  });

  test('falta não conta como última vez, e quem nunca veio fica sem contexto', async () => {
    await na(async () => {
      await agendar(db, { data: dia(-9), hora: '10:00', status: 'falta' });
      await agendar(db, { data: dia(1), hora: '10:00' });
    });
    await dona('POST', '/api/mensagens/fila/gerar');
    assert.equal((await lembrete(dona)).ultimaVisita, null);
  });
});

describe('campanha que fala de um horário', () => {
  const vaga = variaveis => dona('POST', '/api/mensagens/campanhas/vaga', { clienteIds: ['c1'], variaveis });

  test('sai com o dia e a hora no texto, e vale até o horário', async () => {
    const r = await vaga({ data: dia(1), hora: '15:00' });
    assert.equal(r.corpo.enfileiradas, 1);
    const [m] = await mensagens('vaga');
    assert.match(m.texto, /15:00/);
    assert.ok(m.texto.includes(datas.fmtData(dia(1))));
    assert.equal(m.expira_em, `${dia(1)} 15:00`);
  });

  test('sem o horário é recusada, em vez de sair com um buraco', async () => {
    assert.equal((await vaga(undefined)).status, 400);
    assert.equal((await vaga({ data: dia(1) })).status, 400);
    assert.deepEqual(await mensagens('vaga'), []);
  });

  test('horário que já passou é recusado', async () => {
    assert.equal((await vaga({ data: dia(-1), hora: '10:00' })).status, 400);
  });

  test('campanha sem dia nem hora no texto não pede nada', async () => {
    const r = await dona('POST', '/api/mensagens/campanhas/promocao', { clienteIds: ['c1'] });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.enfileiradas, 1);
  });

  test('quem escreve o horário no próprio texto da promoção também precisa informar', async () => {
    await na(() => db.db.run(`UPDATE templates SET texto = 'Só {data}!' WHERE chave = 'fim_de_ano'`));
    const r = await dona('POST', '/api/mensagens/campanhas/fim_de_ano', { clienteIds: ['c1'] });
    assert.equal(r.status, 400);
  });
});

describe('o prazo da Recuperação', () => {
  const lista = async () => (await dona('GET', '/api/mensagens/recuperacao')).corpo;
  const prazo = (quem, dias) => quem('PUT', '/api/mensagens/recuperacao/prazo', { dias });

  test('mudar o prazo muda quem aparece', async () => {
    await na(() => agendar(db, { data: dia(-40), hora: '10:00', status: 'concluido' }));
    assert.deepEqual((await lista()).itens, []);

    assert.equal((await prazo(dona, 30)).status, 200);
    const { prazo: valendo, itens } = await lista();
    assert.equal(valendo, 30);
    assert.deepEqual(itens.map(c => c.id), ['c1']);
  });

  test('número fora da faixa é recusado', async () => {
    for (const dias of [6, 731, 1.5, 'x', null]) {
      assert.equal((await prazo(dona, dias)).status, 400, String(dias));
    }
  });

  test('a profissional não muda', async () => {
    assert.equal((await prazo(ana, 30)).status, 403);
  });
});

describe('o aviso de quando expira', () => {
  const H = '2026-11-05';
  const as = (hora, min) => hora * 60 + min;
  const texto = (expira, agora) => prazoDaMensagem(expira, H, agora);

  test('sem prazo não diz nada', () => {
    assert.equal(prazoDaMensagem(null, H, 600), null);
  });

  test('falta pouco: em minutos ou horas, e urgente', () => {
    assert.deepEqual(texto('2026-11-05 10:40', as(10, 0)), { texto: 'Expira em 40 min', urgente: true });
    assert.deepEqual(texto('2026-11-05 12:30', as(10, 0)), { texto: 'Expira em 2h', urgente: true });
    assert.deepEqual(texto('2026-11-05 10:00', as(10, 5)), { texto: 'Expirando agora', urgente: true });
  });

  test('três horas na virada do dia ainda é urgente', () => {
    assert.deepEqual(texto('2026-11-06 01:00', as(23, 0)), { texto: 'Expira em 2h', urgente: true });
  });

  test('com folga, não alarma', () => {
    assert.deepEqual(texto('2026-11-05 18:00', as(9, 0)), { texto: 'Expira hoje às 18:00', urgente: false });
    assert.deepEqual(texto('2026-11-06 09:30', as(9, 0)), { texto: 'Expira amanhã às 09:30', urgente: false });
    assert.deepEqual(texto('2026-11-10 23:59', as(9, 0)), { texto: 'Expira em 5 dias', urgente: false });
  });

  test('fim do dia não escreve a hora', () => {
    assert.equal(texto('2026-11-05 23:59', as(9, 0)).texto, 'Expira hoje');
    assert.equal(texto('2026-11-06 23:59', as(9, 0)).texto, 'Expira amanhã');
  });
});
