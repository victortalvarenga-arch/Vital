import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, cenario, subirApi, criarEquipe, comoAdmin } from './ambiente.js';

/**
 * A ficha de uma promoção (decisão do dono, 2026-10-28).
 *
 * A promoção vira um agendamento por serviço, ligados por `combo_grupo`. Antes,
 * cada um pedia só a ficha do próprio serviço: a anamnese de limpeza +
 * peeling aparecia duas vezes, e a de um serviço só do segundo horário
 * passava sem ninguém ver ao começar. Agora o pacote pede a ficha de todos
 * os serviços, cada uma uma vez, e a resposta dada num horário vale para o
 * pacote inteiro.
 */

const TERCA = '2027-03-02';
let db, api, dona;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
    await db.db.run(`INSERT INTO services (id,nome,categoria,preco,duracao,intervalo,ativo,ordem)
                     VALUES ('s2','Design de sobrancelha','Rosto',50,30,0,1,1)`);
    await db.salvarVinculos('s2', ['p1']);
  });
  ({ dono: dona } = await criarEquipe(api));
});

after(async () => {
  for (const t of ['form_answers', 'form_services', 'form_fields', 'forms']) {
    await comoAdmin(`DELETE FROM ${t} WHERE tenant_id = 'default'`);
  }
  await api.fechar();
  await db.pool.end();
});

const ficha = (nome, servicosIds) => dona('POST', '/api/formularios', {
  nome, servicosIds, campos: [{ rotulo: 'Alergias', tipo: 'longo', obrigatorio: false }],
});

describe('ficha da promoção', () => {
  let anamnese, pacote;

  before(async () => {
    // A anamnese é pedida pelos dois serviços; a de sobrancelha, só por um.
    anamnese = (await ficha('Anamnese', ['s1', 's2'])).corpo;
    await ficha('Sobrancelha', ['s2']);
    const combo = (await dona('POST', '/api/combos', { nome: 'Dia de cuidado', preco: 130, servicosIds: ['s1', 's2'] })).corpo;
    const r = await dona('POST', '/api/agendamentos/combo', {
      comboId: combo.id, clienteId: 'c1', profissionalId: 'p1', data: TERCA, hora: '10:00',
    });
    assert.equal(r.status, 201, r.corpo?.erro);
    pacote = r.corpo.agendamentos;
    assert.equal(pacote.length, 2);
  });

  test('pede as fichas de todos os serviços, cada uma uma vez', async () => {
    for (const a of pacote) {
      const r = await dona('GET', `/api/agendamentos/${a.id}/formularios`);
      assert.equal(r.status, 200);
      assert.deepEqual(r.corpo.map(f => f.nome).sort(), ['Anamnese', 'Sobrancelha']);
    }
  });

  test('respondida num horário, vale para o outro', async () => {
    const [primeiro, segundo] = pacote;
    const r = await dona('POST', `/api/agendamentos/${primeiro.id}/respostas`, {
      respostas: { [anamnese.id]: [{ campoId: anamnese.campos[0].id, valor: 'nenhuma' }] },
    });
    assert.equal(r.status, 201, r.corpo?.erro);

    const doSegundo = await dona('GET', `/api/agendamentos/${segundo.id}/respostas`);
    assert.deepEqual(doSegundo.corpo.map(x => x.formulario), ['Anamnese']);
  });
});
