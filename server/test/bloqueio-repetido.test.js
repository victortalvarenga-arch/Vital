import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, limparAgenda, cenario, subirApi, criarEquipe } from './ambiente.js';

/**
 * Bloqueio que se repete: férias de três semanas, folga toda terça.
 *
 * O que precisa ser verdade, e que só um teste com banco prova:
 *
 *  1. As ocorrências existem como linhas de verdade — é o que deixa o motor de
 *     horários funcionar sem saber que recorrência existe.
 *  2. **O motor realmente fecha a agenda em todas elas.** Criar as linhas e
 *     mesmo assim oferecer o horário seria o pior desfecho possível: a cliente
 *     marca, e a profissional está viajando.
 *  3. Apagar uma não desfaz as outras; apagar a série desfaz todas.
 *  4. Funcionário não fecha a agenda da empresa nem a da colega.
 */

const TERCA = '2027-03-02';

let db, api, dona, ana;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
  });
  ({ dono: dona, ana } = await criarEquipe(api));
});

after(async () => {
  await api.fechar();
  await db.pool.end();
});

beforeEach(async () => {
  await db.db.comEmpresa('default', async () => {
    await limparAgenda(db);
    await db.db.run('DELETE FROM blocks');
  });
});

const bloqueiosDe = (de, ate) => dona('GET', `/api/bloqueios?de=${de}&ate=${ate}`);

describe('repetir um bloqueio', () => {
  test('três semanas viram três datas, de sete em sete dias', async () => {
    const r = await dona('POST', '/api/bloqueios', {
      profissionalId: 'p1', data: TERCA, horaIni: '09:00', horaFim: '18:00',
      motivo: 'Férias', repetir: { cada: 'semana', vezes: 3 },
    });
    assert.equal(r.status, 201);
    assert.equal(r.corpo.criados, 3);
    assert.ok(r.corpo.serie, 'as três precisam de um laço para virar um comando só');

    const { corpo } = await bloqueiosDe(TERCA, '2027-04-01');
    assert.deepEqual(corpo.map(b => b.data), ['2027-03-02', '2027-03-09', '2027-03-16']);
    assert.ok(corpo.every(b => b.serie === r.corpo.serie));
  });

  test('sem repetição continua sendo uma linha, e sem série', async () => {
    const r = await dona('POST', '/api/bloqueios', {
      profissionalId: 'p1', data: TERCA, horaIni: '12:00', horaFim: '13:00',
    });
    assert.equal(r.corpo.criados, 1);
    assert.equal(r.corpo.serie, null, 'bloqueio avulso não inventa laço');
  });

  test('o teto impede que um erro de digitação vire dez mil linhas', async () => {
    const r = await dona('POST', '/api/bloqueios', {
      profissionalId: 'p1', data: TERCA, horaIni: '09:00', horaFim: '10:00',
      repetir: { cada: 'dia', vezes: 5000 },
    });
    assert.equal(r.corpo.criados, 52);
  });

  test('a cada mês anda o mês, não trinta dias', async () => {
    const r = await dona('POST', '/api/bloqueios', {
      profissionalId: 'p1', data: '2027-01-31', horaIni: '09:00', horaFim: '10:00',
      repetir: { cada: 'mes', vezes: 2 },
    });
    assert.equal(r.corpo.criados, 2);
    const { corpo } = await bloqueiosDe('2027-01-01', '2027-12-31');
    // Fevereiro não tem 31: escorrega para março, que é o comportamento do
    // `Date`. O que não pode é a ocorrência sumir sem ninguém saber.
    assert.equal(corpo.length, 2);
    assert.equal(corpo[0].data, '2027-01-31');
  });
});

describe('lista de datas pronta', () => {
  // A tela monta "segunda e quarta, por N semanas" e manda as datas já
  // calculadas. Refazer essa conta no servidor seria uma segunda versão da
  // mesma regra, livre para divergir da prévia que a pessoa conferiu.
  test('cria exatamente as datas mandadas, numa série só', async () => {
    const datas = ['2027-03-01', '2027-03-03', '2027-03-08', '2027-03-10'];
    const r = await dona('POST', '/api/bloqueios', {
      profissionalId: 'p1', horaIni: '08:00', horaFim: '10:00', datas, motivo: 'Curso',
    });
    assert.equal(r.status, 201);
    assert.equal(r.corpo.criados, 4);
    assert.ok(r.corpo.serie);

    const { corpo } = await bloqueiosDe('2027-03-01', '2027-03-31');
    assert.deepEqual(corpo.map(b => b.data), datas);
  });

  test('data repetida na lista não vira linha repetida', async () => {
    const r = await dona('POST', '/api/bloqueios', {
      profissionalId: 'p1', horaIni: '08:00', horaFim: '10:00',
      datas: ['2027-03-01', '2027-03-01', '2027-03-03'],
    });
    assert.equal(r.corpo.criados, 2);
  });

  test('lista vazia ou com data torta é recusada', async () => {
    const vazia = await dona('POST', '/api/bloqueios', {
      profissionalId: 'p1', horaIni: '08:00', horaFim: '10:00', datas: [],
    });
    assert.equal(vazia.status, 400);

    const torta = await dona('POST', '/api/bloqueios', {
      profissionalId: 'p1', horaIni: '08:00', horaFim: '10:00',
      datas: ['2027-03-01', 'amanhã'],
    });
    assert.equal(torta.status, 400, 'uma data inválida invalida a criação inteira');
    const { corpo } = await bloqueiosDe('2027-03-01', '2027-03-31');
    assert.equal(corpo.length, 0, 'e não pode ter gravado a metade boa');
  });

  test('o motor fecha todas as datas da lista', async () => {
    await dona('POST', '/api/bloqueios', {
      profissionalId: 'p1', horaIni: '00:00', horaFim: '23:59',
      datas: ['2027-03-01', '2027-03-03'],
    });
    for (const dia of ['2027-03-01', '2027-03-03']) {
      const { corpo } = await api.anonimo()('GET',
        `/api/publico/horarios?servicoId=s1&profissionalId=p1&data=${dia}`);
      assert.equal(corpo.horarios.length, 0, `${dia} deveria estar fechado`);
    }
    const { corpo } = await api.anonimo()('GET',
      `/api/publico/horarios?servicoId=s1&profissionalId=p1&data=2027-03-02`);
    assert.ok(corpo.horarios.length > 0, 'o dia entre os dois continua aberto');
  });
});

describe('o motor de horários respeita todas as ocorrências', () => {
  test('nenhuma das três terças oferece horário', async () => {
    const livreAntes = await api.anonimo()('GET',
      `/api/publico/horarios?servicoId=s1&profissionalId=p1&data=2027-03-16`);
    assert.ok(livreAntes.corpo.horarios.length > 0, 'antes do bloqueio havia vaga');

    await dona('POST', '/api/bloqueios', {
      profissionalId: 'p1', data: TERCA, horaIni: '00:00', horaFim: '23:59',
      motivo: 'Férias', repetir: { cada: 'semana', vezes: 3 },
    });

    // A terceira ocorrência é a que interessa: é a que uma recorrência mal
    // expandida deixaria passar.
    for (const dia of ['2027-03-02', '2027-03-09', '2027-03-16']) {
      const { corpo } = await api.anonimo()('GET',
        `/api/publico/horarios?servicoId=s1&profissionalId=p1&data=${dia}`);
      assert.equal(corpo.horarios.length, 0, `${dia} deveria estar fechado`);
    }
  });

  test('a semana seguinte à série continua aberta', async () => {
    await dona('POST', '/api/bloqueios', {
      profissionalId: 'p1', data: TERCA, horaIni: '00:00', horaFim: '23:59',
      repetir: { cada: 'semana', vezes: 3 },
    });
    const { corpo } = await api.anonimo()('GET',
      `/api/publico/horarios?servicoId=s1&profissionalId=p1&data=2027-03-23`);
    assert.ok(corpo.horarios.length > 0, 'bloquear três semanas não pode fechar a quarta');
  });
});

describe('desfazer', () => {
  async function tresSemanas() {
    const r = await dona('POST', '/api/bloqueios', {
      profissionalId: 'p1', data: TERCA, horaIni: '09:00', horaFim: '18:00',
      repetir: { cada: 'semana', vezes: 3 },
    });
    const { corpo } = await bloqueiosDe(TERCA, '2027-04-01');
    return corpo;
  }

  test('apagar uma ocorrência não desfaz as outras', async () => {
    const [, doMeio] = await tresSemanas();
    await dona('DELETE', `/api/bloqueios/${doMeio.id}`);

    const { corpo } = await bloqueiosDe(TERCA, '2027-04-01');
    assert.deepEqual(corpo.map(b => b.data), ['2027-03-02', '2027-03-16']);
  });

  test('apagar a série desfaz todas de uma vez', async () => {
    const [primeira] = await tresSemanas();
    const r = await dona('DELETE', `/api/bloqueios/${primeira.id}?serie=1`);
    assert.equal(r.corpo.apagados, 3);

    const { corpo } = await bloqueiosDe(TERCA, '2027-04-01');
    assert.equal(corpo.length, 0);
  });

  test('pedir série num bloqueio avulso apaga só ele', async () => {
    // Sem esta guarda, `?serie=1` num bloqueio sem laço rodaria
    // `DELETE ... WHERE serie IS NULL` e levaria junto todo bloqueio avulso da
    // empresa.
    await dona('POST', '/api/bloqueios', { profissionalId: 'p1', data: TERCA, horaIni: '09:00', horaFim: '10:00' });
    await dona('POST', '/api/bloqueios', { profissionalId: 'p1', data: TERCA, horaIni: '14:00', horaFim: '15:00' });
    const { corpo: antes } = await bloqueiosDe(TERCA, TERCA);
    assert.equal(antes.length, 2);

    await dona('DELETE', `/api/bloqueios/${antes[0].id}?serie=1`);
    const { corpo: depois } = await bloqueiosDe(TERCA, TERCA);
    assert.equal(depois.length, 1, 'o outro avulso não podia ir junto');
  });
});

describe('quem pode fechar a agenda de quem', () => {
  test('funcionária fecha a própria, repetida também', async () => {
    const r = await ana('POST', '/api/bloqueios', {
      profissionalId: 'p1', data: TERCA, horaIni: '09:00', horaFim: '18:00',
      repetir: { cada: 'semana', vezes: 2 },
    });
    assert.equal(r.status, 201);
    assert.equal(r.corpo.criados, 2);
  });

  test('funcionária não fecha a agenda da colega', async () => {
    const r = await ana('POST', '/api/bloqueios', {
      profissionalId: 'p2', data: TERCA, horaIni: '09:00', horaFim: '18:00',
      repetir: { cada: 'semana', vezes: 3 },
    });
    assert.equal(r.status, 403);
    const { corpo } = await bloqueiosDe(TERCA, '2027-04-01');
    assert.equal(corpo.length, 0, 'nem uma ocorrência pode ter escapado');
  });

  test('funcionária não fecha a empresa toda', async () => {
    // Bloqueio sem dono fecha para todo mundo — decisão do dono.
    const r = await ana('POST', '/api/bloqueios', {
      data: TERCA, horaIni: '09:00', horaFim: '18:00', motivo: 'Feriado',
    });
    assert.equal(r.status, 403);
  });
});
