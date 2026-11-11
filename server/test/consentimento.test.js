import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, cenario, subirApi, criarEquipe } from './ambiente.js';

/**
 * O consentimento de marketing tem data e origem (migration 039).
 *
 * `optin` era um 0/1 sem história: nascia ligado e ninguém sabia desde quando
 * nem por onde a pessoa tinha aceitado. Provar o aceite é o que a LGPD pede
 * quando alguém reclama de uma mensagem — e o que a exportação precisa levar
 * junto quando a lista sai para outra ferramenta.
 */

const DIA = '2027-03-05';

let db, api, dona, hoje;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  ({ hoje } = await import('../src/lib/dates.js'));

  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
  });

  ({ dono: dona } = await criarEquipe(api));
});

after(async () => {
  await api.fechar();
  await db.pool.end();
});

const cliente = fone => db.db.comEmpresa('default', () =>
  db.db.get('SELECT optin, optin_em, optin_origem FROM clients WHERE fone=?', fone));

describe('consentimento com data e origem', () => {
  test('primeiro agendamento pelo site: o aceite fica com dia e origem', async () => {
    const r = await api.anonimo()('POST', '/api/publico/agendar', {
      nome: 'Nova do Site', fone: '47977770001', nascimento: '1992-01-02',
      servicoId: 's1', profissionalId: 'p1', data: DIA, hora: '09:00',
    });
    assert.equal(r.status, 201);
    const c = await cliente('47977770001');
    assert.equal(!!c.optin, true);
    assert.equal(c.optin_em, hoje());
    assert.equal(c.optin_origem, 'site');
  });

  test('o "não aceito" do site também tem dia — a recusa é prova tanto quanto o aceite', async () => {
    const r = await api.anonimo()('POST', '/api/publico/agendar', {
      nome: 'Sem Mensagens', fone: '47977770002', nascimento: '1990-03-04',
      servicoId: 's1', profissionalId: 'p1', data: DIA, hora: '11:00',
      aceitaMensagens: false,
    });
    assert.equal(r.status, 201);
    const c = await cliente('47977770002');
    assert.equal(!!c.optin, false);
    assert.equal(c.optin_em, hoje());
    assert.equal(c.optin_origem, 'site');
  });

  test('cadastro pelo balcão marca painel', async () => {
    const r = await dona('POST', '/api/clientes', { nome: 'Do Balcão', fone: '47977770003' });
    assert.equal(r.status, 201);
    const c = await cliente('47977770003');
    assert.equal(c.optin_em, hoje());
    assert.equal(c.optin_origem, 'painel');
  });

  test('editar a ficha sem tocar no optin não reescreve o aceite', async () => {
    const r = await dona('POST', '/api/clientes', { nome: 'Antiga Aceita', fone: '47977770004' });
    const id = r.corpo.id;
    // Envelhece o aceite à mão, como se tivesse vindo do site tempos atrás.
    await db.db.comEmpresa('default', () =>
      db.db.run(`UPDATE clients SET optin_em='2026-01-01', optin_origem='site' WHERE id=?`, id));

    await dona('PUT', `/api/clientes/${id}`, { nome: 'Antiga Aceita Silva' });
    let c = await cliente('47977770004');
    assert.equal(c.optin_em, '2026-01-01', 'mexer no nome não é mexer no consentimento');
    assert.equal(c.optin_origem, 'site');

    await dona('PUT', `/api/clientes/${id}`, { optin: false });
    c = await cliente('47977770004');
    assert.equal(!!c.optin, false);
    assert.equal(c.optin_em, hoje(), 'desligar é um fato novo, com data nova');
    assert.equal(c.optin_origem, 'painel');
  });

  test('a exportação leva a prova junto', async () => {
    const r = await dona('GET', '/api/exportar/clientes.csv');
    assert.equal(r.status, 200);
    assert.match(String(r.corpo), /Consentimento registrado em/);
    assert.match(String(r.corpo), /Consentimento por/);
  });
});
