import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * As faixas fechadas que a Agenda pinta quando há uma profissional escolhida.
 *
 * É desenho, não regra — mas desenho de disponibilidade erra do jeito mais
 * caro: mostrar como livre uma hora em que ninguém atende faz marcar, e quem
 * recusa é o servidor, depois de a cliente já ter escolhido.
 */

let fechadoNoDia;

before(async () => {
  ({ fechadoNoDia } = await import('../../web/src/shared/jornada.js'));
});

// 2027-03-01 é uma segunda-feira; 2027-03-07, um domingo.
const SEGUNDA = '2027-03-01';
const DOMINGO = '2027-03-07';
const GRADE = { deMin: 8 * 60, ateMin: 20 * 60 };

const karen = { jornada: { 1: ['13:00', '19:00'], 3: ['13:00', '19:00'] } };
const laura = { jornada: { 1: ['08:00', '20:00'] } };

describe('o que a grade pinta de fechado', () => {
  test('antes de abrir e depois de fechar, duas faixas', () => {
    const f = fechadoNoDia({ profissional: karen, data: SEGUNDA, ...GRADE });
    assert.deepEqual(f, [
      { ini: 480, fim: 780, motivo: 'Antes das 13:00' },
      { ini: 1140, fim: 1200, motivo: 'Depois das 19:00' },
    ]);
  });

  test('dia de folga fecha a coluna inteira', () => {
    const f = fechadoNoDia({ profissional: karen, data: DOMINGO, ...GRADE });
    assert.deepEqual(f, [{ ini: 480, fim: 1200, motivo: 'Não atende neste dia' }]);
  });

  test('quem trabalha a grade inteira não ganha faixa nenhuma', () => {
    assert.deepEqual(fechadoNoDia({ profissional: laura, data: SEGUNDA, ...GRADE }), []);
  });

  test('a faixa não passa da grade', () => {
    // A grade se estica para caber um atendimento das 7h: o "antes de abrir"
    // acompanha, senão sobra uma hora branca sem explicação no topo.
    const f = fechadoNoDia({ profissional: karen, data: SEGUNDA, deMin: 7 * 60, ateMin: 21 * 60 });
    assert.equal(f[0].ini, 420);
    assert.equal(f[1].fim, 1260);
  });

  test('jornada que começa antes da grade não vira faixa negativa', () => {
    const cedo = { jornada: { 1: ['06:00', '23:00'] } };
    assert.deepEqual(fechadoNoDia({ profissional: cedo, data: SEGUNDA, ...GRADE }), []);
  });

  test('sem profissional não se inventa jornada', () => {
    const f = fechadoNoDia({ profissional: null, data: SEGUNDA, ...GRADE });
    assert.deepEqual(f, [{ ini: 480, fim: 1200, motivo: 'Não atende neste dia' }]);
  });
});
