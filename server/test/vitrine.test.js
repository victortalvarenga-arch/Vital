import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, cenario, subirApi, criarEquipe } from './ambiente.js';

/**
 * O que a vitrine pública decide pelo site.
 *
 * Achados no percurso de uma empresa nova (2026-10-10/14): a chave "Fotos dos
 * serviços" do painel não fazia nada, e serviço criado sem categoria ganhava
 * "Geral", palavra nossa que virava cartão no site da empresa.
 */

let db, api, dona;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
    await db.db.run(`UPDATE services SET foto = '/uploads/default/corte.jpg' WHERE id = 's1'`);
  });
  ({ dono: dona } = await criarEquipe(api));
});

after(async () => {
  await api.fechar();
  await db.pool.end();
});

const vitrine = async () => (await api.anonimo()('GET', '/api/publico/vitrine')).corpo;

describe('a vitrine respeita o painel', () => {
  test('"Fotos dos serviços" desligada tira a foto de todo serviço', async () => {
    await dona('PUT', '/api/config', { exibir: { fotos: true } });
    assert.equal((await vitrine()).servicos.find(s => s.id === 's1').foto, '/uploads/default/corte.jpg');

    await dona('PUT', '/api/config', { exibir: { fotos: false } });
    assert.equal((await vitrine()).servicos.find(s => s.id === 's1').foto, '');

    await dona('PUT', '/api/config', { exibir: { fotos: true } });
  });

  test('serviço criado sem categoria fica sem categoria, não "Geral"', async () => {
    const r = await dona('POST', '/api/servicos', {
      nome: 'Avaliação', preco: 0, duracao: 30, ativo: true, profissionais: ['p1'],
    });
    assert.equal(r.status, 201, r.corpo?.erro);
    assert.equal(r.corpo.categoria, '');
    assert.equal((await vitrine()).servicos.find(s => s.nome === 'Avaliação').categoria, '');
  });
});
