import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, cenario, subirApi, criarEquipe, comoAdmin } from './ambiente.js';

/**
 * O funil no painel da empresa.
 *
 * Até 2026-10-28 só a equipe da Vital via onde as visitas desistiam; o dono,
 * que é quem pode mudar o próprio site, não. A rota abre o número para ele —
 * e só para ele: o funcionário não cuida do site.
 */

let db, api, dona, funcionaria;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
  });
  await comoAdmin('DELETE FROM funil');
  ({ dono: dona, ana: funcionaria } = await criarEquipe(api));
});

after(async () => {
  await api.fechar();
  await db.pool.end();
});

const sessao = n => String(n).padStart(32, '0');
const marcar = (s, etapa) => api.anonimo()('POST', '/api/publico/evento', { sessao: s, etapa });

describe('funil no painel', () => {
  test('o dono vê os passos do próprio site, com a maior queda', async () => {
    for (let n = 1; n <= 4; n++) await marcar(sessao(n), 'site');
    await marcar(sessao(1), 'agendamento');

    const r = await dona('GET', '/api/relatorios/funil');
    assert.equal(r.status, 200, r.corpo?.erro);
    const [site, agendamento] = r.corpo.passos;
    assert.equal(site.total, 4);
    assert.equal(agendamento.total, 1);
    assert.equal(agendamento.doAnterior, 25);
    assert.deepEqual(r.corpo.maiorQueda, { de: 'Abriu o site', para: 'Abriu o agendamento', perdidos: 3 });
  });

  test('funcionário não vê: o site não é dele', async () => {
    const r = await funcionaria('GET', '/api/relatorios/funil');
    assert.equal(r.status, 403);
  });
});
