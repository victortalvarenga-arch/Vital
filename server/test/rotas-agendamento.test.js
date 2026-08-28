import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, limparAgenda, cenario, agendar, subirApi, criarEquipe } from './ambiente.js';

/**
 * Rotas de agendamento, faladas por HTTP como o navegador falaria.
 *
 * Chamar a função exportada pularia o middleware de empresa, o cookie de sessão
 * e a guarda de papel — que é exatamente onde os vazamentos deste projeto
 * apareceram: a funcionária lendo o relatório do negócio inteiro, e o
 * `/api/estado` devolvendo a agenda que a rota filtrada escondia.
 */

const DIA = '2027-03-05';

let db, api, dona, ana;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();

  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
    // O extra e a regra que o oferece na Limpeza — sem isso o servidor recusa
    // o adicional, e com razão.
    await db.db.run(
      `INSERT INTO services (id,nome,categoria,preco,duracao,intervalo,ativo,ordem)
       VALUES ('x1','Design de sobrancelha','Rosto',40,30,0,1,1)`
    );
    await db.db.run(`INSERT INTO service_addons (service_id, addon_id) VALUES ('s1','x1')`);
  });

  ({ dono: dona, ana } = await criarEquipe(api));
});

after(async () => {
  await api.fechar();
  await db.pool.end();
});

beforeEach(async () => {
  await db.db.comEmpresa('default', () => limparAgenda(db));
});

describe('adicionais chegam ao painel', () => {
  /** Agenda pelo site, como a cliente faria, com o extra junto. */
  const agendarPeloSite = () => api.anonimo()('POST', '/api/publico/agendar', {
    nome: 'Cliente Nova', fone: '47988887777', nascimento: '1990-05-10',
    servicoId: 's1', profissionalId: 'p1', data: DIA, hora: '10:00',
    adicionaisIds: ['x1'],
  });

  test('a lista da agenda traz o que foi vendido junto', async () => {
    const venda = await agendarPeloSite();
    assert.equal(venda.status, 201);

    const { corpo } = await dona('GET', `/api/agendamentos?data=${DIA}`);
    assert.equal(corpo.length, 1);
    // Sem isto, quem atende lê "Corte" e não sabe que a cliente também comprou
    // a sobrancelha — e a duração e o valor na tela não fecham com nada.
    assert.deepEqual(corpo[0].adicionais.map(a => a.nome), ['Design de sobrancelha']);
    assert.equal(corpo[0].valor, 140, 'o valor soma serviço e extra');
    assert.equal(corpo[0].duracao, 90, 'a duração soma serviço e extra');
  });

  test('o bootstrap do painel traz os mesmos extras', async () => {
    await agendarPeloSite();
    // /api/estado é a tela inteira numa chamada só; já foi a porta dos fundos
    // que devolvia o que a rota filtrada escondia.
    const { corpo } = await dona('GET', '/api/estado');
    const meu = corpo.agendamentos.find(a => a.data === DIA);
    assert.deepEqual(meu.adicionais.map(a => a.nome), ['Design de sobrancelha']);
  });

  test('agendamento sem extra traz lista vazia, não campo faltando', async () => {
    await api.anonimo()('POST', '/api/publico/agendar', {
      nome: 'Outra Cliente', fone: '47988886666', nascimento: '1990-05-10',
      servicoId: 's1', profissionalId: 'p1', data: DIA, hora: '14:00',
    });
    const { corpo } = await dona('GET', `/api/agendamentos?data=${DIA}`);
    assert.deepEqual(corpo[0].adicionais, []);
  });

  test('o preço do extra fica congelado no que a cliente pagou', async () => {
    await agendarPeloSite();
    await db.db.comEmpresa('default', () =>
      db.db.run(`UPDATE services SET preco = 90 WHERE id = 'x1'`));

    const { corpo } = await dona('GET', `/api/agendamentos?data=${DIA}`);
    assert.equal(corpo[0].adicionais[0].preco, 40,
      'mudar a tabela de preços não pode reescrever venda passada');
  });
});

describe('funcionário só mexe na própria agenda', () => {
  const daBia = { prof: 'p2', data: DIA, hora: '15:00' };

  test('lê só a própria — e o bootstrap concorda', async () => {
    await db.db.comEmpresa('default', async () => {
      await agendar(db, { prof: 'p1', data: DIA, hora: '09:00' });
      await agendar(db, daBia);
    });

    const lista = await ana('GET', `/api/agendamentos?data=${DIA}`);
    assert.deepEqual(lista.corpo.map(a => a.profissionalId), ['p1']);

    const estado = await ana('GET', '/api/estado');
    assert.ok(estado.corpo.agendamentos.every(a => a.profissionalId === 'p1'));
  });

  test('não marca na agenda de outra', async () => {
    const r = await ana('POST', '/api/agendamentos', {
      clienteId: 'c1', servicoId: 's1', profissionalId: 'p2', data: DIA, hora: '11:00',
    });
    assert.equal(r.status, 403);
  });

  test('marca na própria', async () => {
    const r = await ana('POST', '/api/agendamentos', {
      clienteId: 'c1', servicoId: 's1', profissionalId: 'p1', data: DIA, hora: '11:00',
    });
    assert.equal(r.status, 201);
  });

  test('não altera agendamento de outra, mesmo sabendo o id', async () => {
    await db.db.comEmpresa('default', () => agendar(db, daBia));
    const id = `a-${DIA}-15:00-p2`;
    // Esconder a agenda alheia da tela nunca foi controle de acesso: id de
    // agendamento circula em link de confirmação e em URL.
    const r = await ana('PUT', `/api/agendamentos/${id}`, { status: 'cancelado' });
    assert.equal(r.status, 403);

    await db.db.comEmpresa('default', async () => {
      const ainda = await db.db.get('SELECT status FROM appointments WHERE id=?', id);
      assert.equal(ainda.status, 'agendado');
    });
  });

  test('não apaga agendamento de outra', async () => {
    await db.db.comEmpresa('default', () => agendar(db, daBia));
    const r = await ana('DELETE', `/api/agendamentos/a-${DIA}-15:00-p2`);
    assert.equal(r.status, 403);

    await db.db.comEmpresa('default', async () => {
      const { n } = await db.db.get('SELECT COUNT(*) n FROM appointments');
      assert.equal(n, 1, 'o agendamento continua lá');
    });
  });

  test('não empurra a própria cliente para a agenda de outra', async () => {
    await db.db.comEmpresa('default', () => agendar(db, { prof: 'p1', data: DIA, hora: '09:00' }));
    // A guarda precisa olhar o depois, não só o antes: o agendamento é dela
    // agora, mas o PUT o transferiria para a Bia.
    const r = await ana('PUT', `/api/agendamentos/a-${DIA}-09:00-p1`, { profissionalId: 'p2' });
    assert.equal(r.status, 403);
  });

  test('altera e apaga o que é seu', async () => {
    await db.db.comEmpresa('default', () => agendar(db, { prof: 'p1', data: DIA, hora: '09:00' }));
    const id = `a-${DIA}-09:00-p1`;
    assert.equal((await ana('PUT', `/api/agendamentos/${id}`, { status: 'concluido' })).status, 200);
    assert.equal((await ana('DELETE', `/api/agendamentos/${id}`)).status, 200);
  });
});

describe('dona mexe em tudo', () => {
  test('marca, altera e apaga na agenda de qualquer uma', async () => {
    const criado = await dona('POST', '/api/agendamentos', {
      clienteId: 'c1', servicoId: 's1', profissionalId: 'p2', data: DIA, hora: '16:00',
    });
    assert.equal(criado.status, 201);
    const id = criado.corpo.id;

    assert.equal((await dona('PUT', `/api/agendamentos/${id}`, { status: 'concluido' })).status, 200);
    assert.equal((await dona('DELETE', `/api/agendamentos/${id}`)).status, 200);
  });

  test('vê a agenda das duas', async () => {
    await db.db.comEmpresa('default', async () => {
      await agendar(db, { prof: 'p1', data: DIA, hora: '09:00' });
      await agendar(db, { prof: 'p2', data: DIA, hora: '15:00' });
    });
    const { corpo } = await dona('GET', `/api/agendamentos?data=${DIA}`);
    assert.deepEqual(corpo.map(a => a.profissionalId).sort(), ['p1', 'p2']);
  });
});

describe('sem login não passa', () => {
  test('a agenda do painel recusa quem não entrou', async () => {
    const fora = api.anonimo();
    for (const [metodo, caminho] of [
      ['GET', '/api/agendamentos'],
      ['GET', '/api/estado'],
      ['POST', '/api/agendamentos'],
      ['DELETE', `/api/agendamentos/a-${DIA}-09:00-p1`],
    ]) {
      const corpo = metodo === 'GET' ? undefined : {};
      assert.equal((await fora(metodo, caminho, corpo)).status, 401, `${metodo} ${caminho}`);
    }
  });
});
