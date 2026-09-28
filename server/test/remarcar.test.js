import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { podeRemarcar } from '../../web/src/shared/remarcar.js';

/**
 * A regra que decide se um atendimento pode ser arrastado para outro lugar da
 * agenda.
 *
 * Mora fora do React porque é conta pura, e porque o erro que ela evita é caro:
 * arrastar sem querer para cima de outra cliente, ou para um dia em que a
 * profissional não trabalha. Ela **não substitui** o servidor — lá a conferência
 * acontece dentro da transação que grava, que é o único lugar onde duas pessoas
 * arrastando no mesmo segundo podem ser separadas. O que se testa aqui é o que a
 * tela promete enquanto o dedo ainda está em cima.
 */

const SEXTA = '2027-03-05';
const SABADO = '2027-03-06';
const DOMINGO = '2027-03-07';

// Trabalha de segunda a sábado, das 9h às 18h. Domingo não.
const ANA = {
  id: 'p1', nome: 'Ana Souza',
  jornada: { 1: ['09:00', '18:00'], 2: ['09:00', '18:00'], 3: ['09:00', '18:00'],
             4: ['09:00', '18:00'], 5: ['09:00', '18:00'], 6: ['09:00', '18:00'] },
};

const CORTE = { id: 'a1', prof: 'p1', data: SEXTA, hora: '10:00', duracao: 60, status: 'agendado' };
const AGORA = { data: SEXTA, hora: '08:00' };

const tentar = (para, extra = {}) => podeRemarcar({
  agendamento: CORTE, para, profissional: ANA,
  agendamentos: [CORTE], bloqueios: [], agora: AGORA, ...extra,
});

describe('o que pode', () => {
  test('mover para um buraco no mesmo dia', () => {
    assert.deepEqual(tentar({ data: SEXTA, hora: '14:00' }), { ok: true });
  });

  test('mover para outro dia de trabalho', () => {
    assert.deepEqual(tentar({ data: SABADO, hora: '09:00' }), { ok: true });
  });

  test('encostar no fim de outro atendimento', () => {
    const outro = { id: 'a2', prof: 'p1', data: SEXTA, hora: '14:00', duracao: 60, status: 'agendado' };
    assert.deepEqual(tentar({ data: SEXTA, hora: '15:00' }, { agendamentos: [CORTE, outro] }),
      { ok: true }, '15:00 começa quando o das 14:00 acaba');
  });

  test('cair em cima de um cancelado', () => {
    const cancelado = { id: 'a3', prof: 'p1', data: SEXTA, hora: '14:00', duracao: 60, status: 'cancelado' };
    assert.deepEqual(tentar({ data: SEXTA, hora: '14:00' }, { agendamentos: [CORTE, cancelado] }),
      { ok: true }, 'cancelado não ocupa a cadeira');
  });

  test('o primeiro e o último horário do expediente', () => {
    assert.deepEqual(tentar({ data: SABADO, hora: '09:00' }), { ok: true });
    assert.deepEqual(tentar({ data: SABADO, hora: '17:00' }), { ok: true }, 'termina às 18:00, em ponto');
  });
});

describe('o que não pode', () => {
  test('o mesmo lugar não é remarcação', () => {
    const r = tentar({ data: SEXTA, hora: '10:00' });
    assert.equal(r.ok, false);
    assert.equal(r.igual, true, 'a tela usa isso para não perguntar nada');
  });

  test('dia que já passou', () => {
    assert.match(tentar({ data: '2027-03-04', hora: '10:00' }).motivo, /passou/);
  });

  test('hora que já passou, hoje', () => {
    assert.match(tentar({ data: SEXTA, hora: '07:00' }, { agora: { data: SEXTA, hora: '08:00' } }).motivo,
      /passou/);
    assert.equal(tentar({ data: SEXTA, hora: '09:00' }, { agora: { data: SEXTA, hora: '08:00' } }).ok,
      true, 'daqui a pouco pode');
  });

  test('dia em que a profissional não trabalha', () => {
    assert.match(tentar({ data: DOMINGO, hora: '10:00' }).motivo, /não trabalha/);
  });

  test('antes de abrir e depois de fechar', () => {
    assert.match(tentar({ data: SABADO, hora: '08:00' }).motivo, /fora do horário/);
    assert.match(tentar({ data: SABADO, hora: '17:30' }).motivo, /fora do horário/,
      'terminaria 18:30, meia hora depois de fechar');
  });

  test('em cima de outro atendimento — começando junto, no meio ou antes', () => {
    const outro = { id: 'a2', prof: 'p1', data: SABADO, hora: '14:00', duracao: 60, status: 'agendado' };
    const com = { agendamentos: [CORTE, outro] };
    assert.match(tentar({ data: SABADO, hora: '14:00' }, com).motivo, /ocupado/);
    assert.match(tentar({ data: SABADO, hora: '14:30' }, com).motivo, /ocupado/, 'começa dentro');
    assert.match(tentar({ data: SABADO, hora: '13:30' }, com).motivo, /ocupado/, 'termina dentro');
  });

  test('o atendimento de OUTRA profissional não atrapalha', () => {
    const daBia = { id: 'a2', prof: 'p2', data: SABADO, hora: '14:00', duracao: 60, status: 'agendado' };
    assert.deepEqual(tentar({ data: SABADO, hora: '14:00' }, { agendamentos: [CORTE, daBia] }),
      { ok: true }, 'a cadeira ocupada é a da outra');
  });

  test('horário bloqueado, dela ou da empresa', () => {
    const almoco = { data: SABADO, horaIni: '12:00', horaFim: '13:00', profissionalId: 'p1' };
    assert.match(tentar({ data: SABADO, hora: '12:00' }, { bloqueios: [almoco] }).motivo, /bloqueado/);

    const feriado = { data: SABADO, horaIni: '09:00', horaFim: '18:00', profissionalId: null };
    assert.match(tentar({ data: SABADO, hora: '10:00' }, { bloqueios: [feriado] }).motivo, /bloqueado/,
      'bloqueio sem dono fecha a empresa toda');

    const daOutra = { data: SABADO, horaIni: '12:00', horaFim: '13:00', profissionalId: 'p2' };
    assert.equal(tentar({ data: SABADO, hora: '12:00' }, { bloqueios: [daOutra] }).ok, true,
      'o almoço da colega não fecha a agenda dela');
  });

  test('atendimento que já aconteceu não se arrasta', () => {
    for (const status of ['concluido', 'falta']) {
      const feito = { ...CORTE, status };
      const r = podeRemarcar({
        agendamento: feito, para: { data: SABADO, hora: '10:00' }, profissional: ANA,
        agendamentos: [feito], bloqueios: [], agora: AGORA,
      });
      assert.equal(r.ok, false, status);
      assert.match(r.motivo, /já aconteceu/);
    }
  });
});
