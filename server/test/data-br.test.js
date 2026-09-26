import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { paraBR, paraISO } from '../../web/src/shared/datas-br.js';

/**
 * A conversão entre 'YYYY-MM-DD' (o formato do sistema inteiro) e dd/mm/aaaa
 * (o que se lê e se digita no Brasil).
 *
 * Mora fora do React de propósito: é conta pura, e o erro que ela evita —
 * 09/05 lido como 9 de maio quando era 5 de setembro — é um agendamento no dia
 * errado. O `<input type="date">` do navegador não serve porque desenha no
 * formato da língua dele, não da página.
 */

describe('mostrar a data', () => {
  test('ISO vira dd/mm/aaaa', () => {
    assert.equal(paraBR('2026-09-25'), '25/09/2026');
    assert.equal(paraBR('2026-01-05'), '05/01/2026', 'zero à esquerda fica');
  });

  test('o que não é data vira vazio, em vez de "NaN/NaN"', () => {
    for (const lixo of ['', null, undefined, '2026-9-5', '25/09/2026', 'ontem']) {
      assert.equal(paraBR(lixo), '', JSON.stringify(lixo));
    }
  });
});

describe('ler o que foi digitado', () => {
  test('dd/mm/aaaa vira ISO', () => {
    assert.equal(paraISO('25/09/2026'), '2026-09-25');
    assert.equal(paraISO('05/01/2026'), '2026-01-05');
    assert.equal(paraISO(' 25/09/2026 '), '2026-09-25', 'espaço sobrando não atrapalha');
  });

  test('dia que não existe no calendário não vira data', () => {
    // O perigo de converter na mão: `new Date(2026, 1, 31)` vira 3 de março
    // caladamente, e o agendamento nasce numa data que ninguém escolheu.
    assert.equal(paraISO('31/02/2026'), '', '31 de fevereiro');
    assert.equal(paraISO('31/04/2026'), '', 'abril tem 30');
    assert.equal(paraISO('29/02/2025'), '', '2025 não é bissexto');
    assert.equal(paraISO('29/02/2024'), '2024-02-29', '2024 é');
  });

  test('meio digitado não vira data nenhuma', () => {
    for (const parcial of ['', '2', '25', '25/0', '25/09', '25/09/20', '25/09/202']) {
      assert.equal(paraISO(parcial), '', JSON.stringify(parcial));
    }
  });

  test('mês e dia trocados são recusados como tal, não convertidos', () => {
    // Quem digita no formato americano por engano recebe vazio, e a tela não
    // avança — melhor do que marcar 9 de maio achando que é 5 de setembro.
    assert.equal(paraISO('2026-09-25'), '');
    assert.equal(paraISO('13/25/2026'), '', 'mês 25 não existe');
  });

  test('ida e volta não perde nada', () => {
    for (const iso of ['2026-09-25', '2024-02-29', '2026-12-31', '2027-01-01']) {
      assert.equal(paraISO(paraBR(iso)), iso, iso);
    }
  });
});
