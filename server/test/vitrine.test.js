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

  test('antes e depois só entra com autorização, e quem autorizou não vai para o site', async () => {
    const caso = { titulo: 'Limpeza', antes: '/uploads/default/a.jpg', depois: '/uploads/default/d.jpg' };
    const sem = await dona('PUT', '/api/config', { antesDepois: [caso] });
    assert.equal(sem.status, 400);
    assert.match(sem.corpo.erro, /quem autorizou/);

    const futuro = await dona('PUT', '/api/config', {
      antesDepois: [{ ...caso, autorizacao: { nome: 'Maria Souza', data: '2999-01-01' } }],
    });
    assert.equal(futuro.status, 400, 'autorização com data no futuro não vale');

    const ok = await dona('PUT', '/api/config', {
      antesDepois: [{ ...caso, autorizacao: { nome: 'Maria Souza', data: '2026-09-01', como: 'termo assinado' } }],
    });
    assert.equal(ok.status, 200, ok.corpo?.erro);
    assert.equal(ok.corpo.antesDepois[0].autorizacao.registradoPor, 'Dona', 'o servidor anota quem registrou');

    const v = await vitrine();
    assert.deepEqual(v.antesDepois, [caso]);
    assert.ok(!JSON.stringify(v).includes('Maria Souza'), 'o nome da cliente não é público');

    await dona('PUT', '/api/config', { antesDepois: [] });
  });

  test('caso gravado sem autorização (config antiga) não é publicado', async () => {
    await db.db.comEmpresa('default', () => db.setConfig({
      antesDepois: [{ titulo: 'Antigo', antes: '/a.jpg', depois: '/d.jpg' }],
    }));
    assert.deepEqual((await vitrine()).antesDepois, []);
    await db.db.comEmpresa('default', () => db.setConfig({ antesDepois: [] }));
  });

  test('várias promoções de uma vez: cada uma com os seus serviços e a sua equipe', async () => {
    // As promoções são montadas todas juntas (três consultas, não três por
    // promoção). O risco de juntar é misturar: o serviço de uma ir parar na
    // outra, ou a equipe de uma valer para todas.
    await db.db.comEmpresa('default', async () => {
      await db.db.run(`INSERT INTO services (id,nome,categoria,preco,duracao,intervalo,ativo,ordem) VALUES
        ('vb','Barba','Cabelo',50,30,0,1,1), ('vh','Hidratação','Cabelo',80,30,0,1,2)`);
      await db.salvarVinculos('vb', ['p1']);
      await db.salvarVinculos('vh', ['p2']);
    });
    const a = (await dona('POST', '/api/combos', { nome: 'Corte e barba', servicosIds: ['s1', 'vb'], preco: 120 })).corpo;
    const b = (await dona('POST', '/api/combos', { nome: 'Corte e hidratação', servicosIds: ['s1', 'vh'], preco: 150 })).corpo;
    try {
      const combos = (await vitrine()).combos;
      const ca = combos.find(c => c.id === a.id);
      const cb = combos.find(c => c.id === b.id);
      assert.deepEqual(ca.servicos.map(s => s.id).sort(), ['s1', 'vb']);
      assert.deepEqual(cb.servicos.map(s => s.id).sort(), ['s1', 'vh']);
      assert.deepEqual(ca.profissionais, ['p1'], 'só a Ana faz corte e barba');
      assert.deepEqual(cb.profissionais, ['p2'], 'só a Bia faz corte e hidratação');
      assert.equal(ca.precoCheio, 150);
      assert.equal(cb.precoCheio, 180);
    } finally {
      await db.db.comEmpresa('default', async () => {
        await db.db.run(`DELETE FROM combo_services WHERE combo_id IN (?, ?)`, a.id, b.id);
        await db.db.run(`DELETE FROM combos WHERE id IN (?, ?)`, a.id, b.id);
        await db.db.run(`DELETE FROM service_staff WHERE service_id IN ('vb','vh')`);
        await db.db.run(`DELETE FROM services WHERE id IN ('vb','vh')`);
      });
    }
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
