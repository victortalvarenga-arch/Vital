import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estadoInicial, intervaloDe, deslocar, podeAvancar, degrauDe, tituloDe, intervaloPorExtenso,
} from '../../web/src/shared/periodo.js';

/**
 * O período do Financeiro: filtros e setas.
 *
 * É conta pura sobre texto 'YYYY-MM-DD' (sem banco, sem tela), e é onde mora o
 * erro que só aparece de vez em quando: virada de ano, fevereiro bissexto,
 * seta que não pode passar do período atual. Fica fora do React justamente para
 * poder ser testado assim.
 */

const HOJE = '2026-09-25'; // uma sexta-feira

const com = (filtro, ancora = HOJE) => ({ ...estadoInicial(filtro, HOJE), ancora });
const anda = (estado, passo, vezes = 1) => {
  for (let i = 0; i < vezes; i++) estado = deslocar(estado, passo, HOJE);
  return estado;
};

describe('intervalo de cada filtro', () => {
  test('hoje é um dia só', () => {
    assert.deepEqual(intervaloDe(com('hoje'), HOJE), { de: HOJE, ate: HOJE });
  });

  test('semana é a do calendário, domingo a sábado — não os últimos sete dias', () => {
    // HOJE é sexta. A semana vai do domingo (20) ao sábado (26), e não de 19 a 25:
    // é assim que se compara "esta semana" com "a passada".
    assert.deepEqual(intervaloDe(com('semana'), HOJE), { de: '2026-09-20', ate: '2026-09-26' });
    // Qualquer dia dentro dela dá a mesma semana, inclusive o próprio domingo.
    assert.deepEqual(intervaloDe(com('semana', '2026-09-20'), HOJE), { de: '2026-09-20', ate: '2026-09-26' });
    assert.deepEqual(intervaloDe(com('semana', '2026-09-26'), HOJE), { de: '2026-09-20', ate: '2026-09-26' });
  });

  test('mês e ano são o calendário inteiro, mesmo com o mês em andamento', () => {
    assert.deepEqual(intervaloDe(com('mes'), HOJE), { de: '2026-09-01', ate: '2026-09-30' });
    assert.deepEqual(intervaloDe(com('ano'), HOJE), { de: '2026-01-01', ate: '2026-12-31' });
  });

  test('personalizado é o intervalo escolhido, sem ajuste', () => {
    const e = { filtro: 'custom', ancora: HOJE, custom: { de: '2026-03-10', ate: '2026-04-02' } };
    assert.deepEqual(intervaloDe(e, HOJE), { de: '2026-03-10', ate: '2026-04-02' });
  });
});

describe('as setas', () => {
  test('hoje anda de dia em dia, e não passa de hoje', () => {
    const ontem = anda(com('hoje'), -1);
    assert.equal(intervaloDe(ontem, HOJE).de, '2026-09-24');
    assert.equal(tituloDe(ontem, HOJE), 'Ontem');
    assert.equal(podeAvancar(com('hoje'), HOJE), false);
    assert.deepEqual(anda(com('hoje'), +1), com('hoje'), 'a seta para o futuro não faz nada');
  });

  test('semana anda de semana em semana, e atravessa o mês', () => {
    const passada = anda(com('semana'), -1);
    assert.deepEqual(intervaloDe(passada, HOJE), { de: '2026-09-13', ate: '2026-09-19' });
    assert.deepEqual(intervaloDe(anda(passada, +1), HOJE), { de: '2026-09-20', ate: '2026-09-26' });

    // Uma semana que começa em agosto e termina em setembro continua sendo uma só.
    const virada = anda(com('semana'), -4);
    assert.deepEqual(intervaloDe(virada, HOJE), { de: '2026-08-23', ate: '2026-08-29' });
  });

  test('a semana atual é o limite: não se navega para a semana que vem', () => {
    assert.equal(podeAvancar(com('semana'), HOJE), false);
    assert.deepEqual(anda(com('semana'), +1), com('semana'), 'a seta para o futuro não faz nada');
    assert.equal(podeAvancar(anda(com('semana'), -1), HOJE), true);
  });

  test('mês atravessa a virada do ano', () => {
    const dez = anda(com('mes'), -9);
    assert.deepEqual(intervaloDe(dez, HOJE), { de: '2025-12-01', ate: '2025-12-31' });
    assert.equal(tituloDe(dez, HOJE), 'Dezembro 2025');
    assert.deepEqual(intervaloDe(anda(dez, +1), HOJE), { de: '2026-01-01', ate: '2026-01-31' });
  });

  test('mês não estoura em dia 31, e fevereiro bissexto tem 29', () => {
    // Voltar um mês a partir de 31 de março não pode cair em "31 de fevereiro".
    const fevereiro = anda(com('mes', '2024-03-31'), -1);
    assert.deepEqual(intervaloDe(fevereiro, HOJE), { de: '2024-02-01', ate: '2024-02-29' });
    assert.deepEqual(intervaloDe(com('mes', '2025-02-10'), HOJE), { de: '2025-02-01', ate: '2025-02-28' });
  });

  test('mês e ano não vão além do atual', () => {
    assert.equal(podeAvancar(com('mes'), HOJE), false);
    assert.equal(podeAvancar(anda(com('mes'), -1), HOJE), true);
    assert.equal(podeAvancar(com('ano'), HOJE), false);
    assert.equal(podeAvancar(anda(com('ano'), -1), HOJE), true);
    assert.deepEqual(anda(com('mes'), +1), com('mes'), 'a seta para o futuro não faz nada');
  });

  test('ano anda de ano em ano', () => {
    const passado = anda(com('ano'), -1);
    assert.deepEqual(intervaloDe(passado, HOJE), { de: '2025-01-01', ate: '2025-12-31' });
    assert.equal(tituloDe(passado, HOJE), '2025');
  });

  test('personalizado mantém o intervalo escolhido', () => {
    const e = { filtro: 'custom', ancora: HOJE, custom: { de: '2026-03-10', ate: '2026-04-02' } };
    assert.equal(anda(e, -1), e);
    assert.equal(anda(e, +1), e);
    assert.equal(podeAvancar(e, HOJE), false);
  });
});

describe('degrau do gráfico', () => {
  test('hoje é por hora; semana e mês, por dia; ano, por mês', () => {
    assert.equal(degrauDe(com('hoje'), HOJE), 'hora');
    assert.equal(degrauDe(com('semana'), HOJE), 'dia');
    assert.equal(degrauDe(com('mes'), HOJE), 'dia');
    assert.equal(degrauDe(com('ano'), HOJE), 'mes');
  });

  test('personalizado escolhe pelo tamanho: um dia, até 62 dias, além disso', () => {
    const custom = (de, ate) => ({ filtro: 'custom', ancora: HOJE, custom: { de, ate } });
    assert.equal(degrauDe(custom('2026-09-10', '2026-09-10'), HOJE), 'hora');
    assert.equal(degrauDe(custom('2026-08-01', '2026-09-30'), HOJE), 'dia', '61 dias');
    assert.equal(degrauDe(custom('2026-08-01', '2026-10-02'), HOJE), 'mes', '63 dias');
  });
});

describe('texto do período', () => {
  test('títulos', () => {
    assert.equal(tituloDe(com('hoje'), HOJE), 'Hoje');
    assert.equal(tituloDe(com('semana'), HOJE), 'Esta semana');
    assert.equal(tituloDe(anda(com('semana'), -1), HOJE), 'Semana passada');
    assert.equal(tituloDe(anda(com('semana'), -2), HOJE), 'Semana');
    assert.equal(tituloDe(com('mes'), HOJE), 'Setembro 2026');
    assert.equal(tituloDe(com('ano'), HOJE), '2026');
    assert.equal(tituloDe(anda(com('hoje'), -3), HOJE), 'Terça, 22 de setembro');
  });

  test('o intervalo por extenso, com o ano só quando faz diferença', () => {
    assert.equal(intervaloPorExtenso('2026-09-01', '2026-09-30', HOJE), '1 de setembro — 30 de setembro');
    assert.equal(intervaloPorExtenso('2026-09-25', '2026-09-25', HOJE), '25 de setembro');
    assert.equal(intervaloPorExtenso('2025-09-01', '2025-09-30', HOJE),
      '1 de setembro de 2025 — 30 de setembro de 2025');
    assert.equal(intervaloPorExtenso('2025-12-20', '2026-01-10', HOJE),
      '20 de dezembro de 2025 — 10 de janeiro de 2026', 'atravessa a virada: os dois anos');
  });
});
