import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, cenario, subirApi, criarEquipe } from './ambiente.js';

/**
 * A taxa de comissão da colega não chega a quem não vê o negócio inteiro.
 *
 * Estava em "Achados": `/api/estado`, `/api/servicos` e `/api/profissionais`
 * mandavam a taxa de todo mundo para qualquer papel — o valor em reais vinha
 * recortado, a taxa não.
 */

let db, api, dona, ana;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
    await db.db.run(`UPDATE staff SET comissao = 40 WHERE id = 'p1'`);
    await db.db.run(`UPDATE staff SET comissao = 55 WHERE id = 'p2'`);
    await db.db.run(`UPDATE services SET comissao = 30 WHERE id = 's1'`);
    await db.salvarVinculos('s1', ['p1', 'p2'], { p1: 35, p2: 60 });
  });
  ({ dono: dona, ana } = await criarEquipe(api));   // ana = funcionária, p1
});

after(async () => {
  await api.fechar();
  await db.pool.end();
});

describe('taxa de comissão por papel', () => {
  test('a funcionária vê a própria taxa e nenhuma da colega', async () => {
    for (const [rota, pegar] of [
      ['/api/estado', c => ({ profs: c.profissionais, svcs: c.servicos })],
      ['/api/profissionais', c => ({ profs: c })],
      ['/api/servicos', c => ({ svcs: c })],
    ]) {
      const { profs, svcs } = pegar((await ana('GET', rota)).corpo);
      if (profs) {
        assert.equal(profs.find(p => p.id === 'p1').comissao, 40, `${rota}: a própria`);
        assert.equal(profs.find(p => p.id === 'p2').comissao, null, `${rota}: a da colega`);
      }
      if (svcs) {
        const s1 = svcs.find(s => s.id === 's1');
        assert.deepEqual(s1.comissoes, { p1: 35 }, `${rota}: só a exceção dela no serviço`);
        assert.equal(s1.comissao, null, `${rota}: a taxa do serviço`);
      }
    }
  });

  test('a dona continua vendo todas', async () => {
    const { corpo } = await dona('GET', '/api/estado');
    assert.equal(corpo.profissionais.find(p => p.id === 'p2').comissao, 55);
    const s1 = corpo.servicos.find(s => s.id === 's1');
    assert.equal(s1.comissao, 30);
    assert.deepEqual(s1.comissoes, { p1: 35, p2: 60 });
  });
});
