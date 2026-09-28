import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * O cálculo do pagamento, sem banco e sem HTTP.
 *
 * É a regra que decide quanto entrou e, a partir daí, o que a tela mostra e o
 * que o Financeiro soma. Vale testar sozinha porque é aritmética de dinheiro:
 * erra em silêncio, aparece no fim do mês e ninguém sabe de onde veio.
 */

let pagamentoDe;

// Nunca no topo: `db.js` monta o pool na carga do módulo. Este arquivo não usa
// banco, mas a regra da casa vale para todos — um import no topo aqui vira o
// exemplo copiado no próximo teste, que usa.
before(async () => {
  ({ pagamentoDe } = await import('../src/lib/pagamento.js'));
});

const atendimento = recebido => ({ pag_recebido: recebido, pag_forma: 'pix' });

describe('quanto entrou', () => {
  test('sem nada recebido, o atendimento nasce aberto', () => {
    const p = pagamentoDe(null, undefined, 85);
    assert.deepEqual(p, { recebido: 0, status: 'aberto', forma: 'local' });
  });

  test('receber o valor inteiro quita', () => {
    const p = pagamentoDe(atendimento(0), { recebido: 85, forma: 'dinheiro' }, 85);
    assert.equal(p.status, 'pago');
    assert.equal(p.recebido, 85);
    assert.equal(p.forma, 'dinheiro');
  });

  test('receber parte é entrada, e o status diz isso', () => {
    const p = pagamentoDe(atendimento(0), { recebido: 20, forma: 'pix' }, 45);
    assert.equal(p.status, 'parcial');
    assert.equal(p.recebido, 20);
  });

  test('o resto de uma entrada quita, e o total não dobra', () => {
    // O painel manda o total recebido, não o incremento: 20 que já estavam
    // mais 25 da saída são 45, e não 20 + 45.
    const p = pagamentoDe(atendimento(20), { recebido: 45, forma: 'dinheiro' }, 45);
    assert.equal(p.recebido, 45);
    assert.equal(p.status, 'pago');
  });

  test('mandar o mesmo número de novo não cobra duas vezes', () => {
    const uma = pagamentoDe(atendimento(20), { recebido: 20, forma: 'pix' }, 45);
    const outra = pagamentoDe(atendimento(uma.recebido), { recebido: 20, forma: 'pix' }, 45);
    assert.equal(outra.recebido, 20, 'recebido é absoluto, não incremento');
  });

  test('desfazer volta para aberto e larga a forma', () => {
    const p = pagamentoDe(atendimento(45), { status: 'aberto' }, 45);
    assert.deepEqual(p, { recebido: 0, status: 'aberto', forma: 'local' });
  });

  test('status pago sem valor recebe o total — é o que o combo e o gateway dizem', () => {
    const p = pagamentoDe(null, { status: 'pago', forma: 'cartao' }, 120);
    assert.equal(p.recebido, 120);
    assert.equal(p.status, 'pago');
  });

  test('não se recebe mais do que o atendimento vale', () => {
    const p = pagamentoDe(atendimento(0), { recebido: 500, forma: 'pix' }, 45);
    assert.equal(p.recebido, 45);
    assert.equal(p.status, 'pago');
  });

  test('trocar só a forma não mexe no valor', () => {
    const p = pagamentoDe(atendimento(45), { forma: 'cartao' }, 45);
    assert.equal(p.recebido, 45);
    assert.equal(p.forma, 'cartao');
    assert.equal(p.status, 'pago');
  });

  test('baratear o serviço não deixa crédito sobrando', () => {
    // Recebeu 85, e depois o valor do atendimento caiu para 60: o recebido
    // acompanha, senão "falta receber" vira negativo na tela.
    const p = pagamentoDe(atendimento(85), undefined, 60);
    assert.equal(p.recebido, 60);
    assert.equal(p.status, 'pago');
  });

  test('centavos fecham em conta redonda', () => {
    // 0.1 + 0.2 em ponto flutuante não dá 0.3; a conta é em centavos inteiros.
    const p = pagamentoDe(atendimento(0.1), { recebido: 0.3, forma: 'pix' }, 0.3);
    assert.equal(p.recebido, 0.3);
    assert.equal(p.status, 'pago', 'quitou exatamente, sem sobrar um centavo fantasma');
  });

  test('três centavos a menos ainda é entrada', () => {
    const p = pagamentoDe(atendimento(0), { recebido: 44.97, forma: 'pix' }, 45);
    assert.equal(p.status, 'parcial');
  });
});
