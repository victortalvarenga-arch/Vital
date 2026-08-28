import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, limparAgenda, cenario, subirApi, criarEquipe } from './ambiente.js';

/**
 * Combos e promoções.
 *
 * O rateio do desconto é a regra de negócio mais delicada do sistema: é
 * dinheiro que vai virar comissão de alguém. Errar por um centavo aqui não
 * derruba nada — só faz o caixa fechar torto todo mês, e a conta é conferida
 * por uma pessoa que confia no número.
 */

const DIA = '2027-03-05';
const soma = partes => partes.reduce((n, p) => n + p.valor, 0);

/* ------------------------------------------------------------------ *
 * O rateio, sem banco: é conta pura
 * ------------------------------------------------------------------ */
describe('rateio do desconto', () => {
  test('divide na proporção do preço de tabela', () => {
    // Limpeza R$ 150 + Sobrancelha R$ 75 = R$ 225 avulso, pacote por R$ 200.
    const partes = ratearCombo([{ preco: 150 }, { preco: 75 }], 200);
    assert.equal(partes[0].valor, 133.33, 'quem leva o serviço caro absorve mais desconto');
    assert.equal(partes[1].valor, 66.67);
    assert.equal(soma(partes), 200);
  });

  test('com uma pessoa só, ela absorve o desconto inteiro', () => {
    const partes = ratearCombo([{ preco: 225 }], 200);
    assert.deepEqual(partes.map(p => p.valor), [200]);
  });

  test('preços iguais dividem igual', () => {
    const partes = ratearCombo([{ preco: 100 }, { preco: 100 }], 150);
    assert.deepEqual(partes.map(p => p.valor), [75, 75]);
  });

  test('serviço de graça no pacote não fica com o desconto todo', () => {
    // Sem preço de tabela não há proporção a respeitar; o critério que sobra é
    // dividir igual, e o que não pode acontecer é alguém ficar negativo.
    const partes = ratearCombo([{ preco: 0 }, { preco: 0 }], 100);
    assert.deepEqual(partes.map(p => p.valor), [50, 50]);
  });

  test('a soma das partes é sempre exatamente o preço do pacote', () => {
    // Rateio de dinheiro quase nunca fecha redondo. Se cada parte arredondasse
    // por conta própria, o caixa fecharia com centavos sobrando e ninguém
    // descobriria a origem. Aqui vale para qualquer combinação.
    for (let n = 1; n <= 5; n++) {
      for (let caso = 0; caso < 300; caso++) {
        const itens = Array.from({ length: n }, () =>
          ({ preco: Math.round(Math.random() * 50000) / 100 }));
        const cheio = itens.reduce((s, i) => s + i.preco, 0);
        const preco = Math.round(cheio * (0.4 + Math.random() * 0.5) * 100) / 100;

        const partes = ratearCombo(itens, preco);
        assert.equal(
          Math.round(soma(partes) * 100), Math.round(preco * 100),
          `não fechou com ${JSON.stringify(itens)} por ${preco}`
        );
        assert.ok(partes.every(p => p.valor >= 0), 'ninguém pode ficar negativo');
      }
    }
  });

  test('nenhuma parte passa do preço de tabela do próprio serviço', () => {
    // O combo é mais barato que a soma, então cada parte tem de ser menor ou
    // igual ao avulso. Uma parte maior significaria que alguém está lucrando
    // com o desconto de outra.
    const partes = ratearCombo([{ preco: 300 }, { preco: 10 }, { preco: 55.55 }], 250);
    for (const p of partes) assert.ok(p.valor <= p.preco + 0.01, `${p.valor} > ${p.preco}`);
  });
});

/* ------------------------------------------------------------------ *
 * O combo de ponta a ponta
 * ------------------------------------------------------------------ */
let db, api, dona, ana, ratearCombo;

before(async () => {
  db = await prepararBanco();
  // Importado aqui, e não no topo: `combos.js` puxa `db.js`, que monta o pool
  // na carga do módulo com a URL que estiver valendo. Import no topo — estático
  // ou `await import` — roda ANTES deste hook e prende o pool no banco de
  // trabalho. Foi assim que uma rodada de teste apagou o banco de
  // desenvolvimento; `prepararBanco()` agora confere e recusa.
  ({ ratearCombo } = await import('../src/lib/combos.js'));
  api = await subirApi();

  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    // Corte R$ 100 / 60 min, feito pelas duas (vem do cenário padrão).
    await cenario(db);
    // Sobrancelha R$ 50 / 30 min, só a Ana faz.
    await db.db.run(
      `INSERT INTO services (id,nome,categoria,preco,duracao,intervalo,ativo,ordem)
       VALUES ('s2','Design de sobrancelha','Rosto',50,30,0,1,1)`
    );
    await db.salvarVinculos('s2', ['p1']);
  });

  ({ dono: dona, ana } = await criarEquipe(api));
});

after(async () => {
  await api?.fechar();
  await db?.pool.end();
});

beforeEach(async () => {
  await db.db.comEmpresa('default', async () => {
    await limparAgenda(db);
    await db.db.run('DELETE FROM combo_services');
    await db.db.run('DELETE FROM combos');
  });
});

/** Corte R$ 100 + Sobrancelha R$ 50 por R$ 130 — avulso daria R$ 150. */
const novoCombo = (quem = dona, corpo = {}) => quem('POST', '/api/combos', {
  nome: 'Dia de princesa', preco: 130, servicosIds: ['s1', 's2'], ...corpo,
});

describe('cadastro do combo', () => {
  test('calcula a economia sozinha', async () => {
    const r = await novoCombo();
    assert.equal(r.status, 201);
    assert.equal(r.corpo.precoCheio, 150);
    assert.equal(r.corpo.economia, 20, 'a empresa não deve ter de fazer essa conta na mão');
    assert.equal(r.corpo.duracao, 90, 'a cadeira fica ocupada pelo pacote inteiro');
  });

  test('recusa pacote de um serviço só', async () => {
    const r = await novoCombo(dona, { servicosIds: ['s1'] });
    assert.equal(r.status, 400);
  });

  test('recusa pacote que não é mais barato', async () => {
    // Sem vantagem, o selo de promoção estaria mentindo na tela.
    const r = await novoCombo(dona, { preco: 150 });
    assert.equal(r.status, 400);
    assert.match(r.corpo.erro, /menos que os serviços avulsos/);
  });

  test('quem atende também cria promoção', async () => {
    // Decisão do negócio: é a pessoa no balcão que sabe qual serviço está
    // parado e vale empurrar junto.
    assert.equal((await novoCombo(ana)).status, 201);
  });

  test('arquivar não apaga — os agendamentos vendidos apontam para ele', async () => {
    const { corpo: combo } = await novoCombo();
    assert.equal((await dona('DELETE', `/api/combos/${combo.id}`)).status, 200);
    const { corpo: lista } = await dona('GET', '/api/combos');
    assert.equal(lista.find(c => c.id === combo.id).ativo, false);
  });
});

describe('a promoção na vitrine', () => {
  test('sai com preço cheio e economia, para o selo ter o que provar', async () => {
    await novoCombo();
    const { corpo } = await api.anonimo()('GET', '/api/publico/vitrine');
    assert.equal(corpo.combos.length, 1);
    assert.equal(corpo.combos[0].precoCheio, 150);
    assert.equal(corpo.combos[0].economia, 20);
  });

  test('leva quem faz o pacote inteiro, para o site não oferecer quem não faz', async () => {
    await novoCombo();
    const { corpo } = await api.anonimo()('GET', '/api/publico/vitrine');
    assert.deepEqual(corpo.combos[0].profissionais, ['p1'],
      'a Bia não faz sobrancelha, então não faz este combo');
  });

  test('promoção vencida some sozinha, sem job nenhum ter rodado', async () => {
    await novoCombo(dona, { validoAte: '2020-12-31' });
    const { corpo } = await api.anonimo()('GET', '/api/publico/vitrine');
    assert.deepEqual(corpo.combos, []);
  });

  test('arquivada não aparece', async () => {
    const { corpo: combo } = await novoCombo();
    await dona('DELETE', `/api/combos/${combo.id}`);
    const { corpo } = await api.anonimo()('GET', '/api/publico/vitrine');
    assert.deepEqual(corpo.combos, []);
  });
});

describe('vender o combo', () => {
  const comprar = async (hora = '09:00') => {
    const { corpo: combo } = await novoCombo();
    const r = await api.anonimo()('POST', '/api/publico/agendar', {
      nome: 'Cliente do Combo', fone: '47955554444', nascimento: '1992-02-02',
      comboId: combo.id, profissionalId: 'p1', data: DIA, hora,
    });
    return { combo, r };
  };

  test('vira um agendamento por serviço, em sequência', async () => {
    const { r } = await comprar('09:00');
    assert.equal(r.status, 201);

    const ags = r.corpo.agendamentos;
    assert.equal(ags.length, 2);
    assert.deepEqual(ags.map(a => a.hora), ['09:00', '10:00'], 'um começa quando o outro acaba');
    assert.deepEqual(ags.map(a => a.duracao), [60, 30]);
    assert.equal(new Set(ags.map(a => a.comboGrupo)).size, 1, 'mesma venda, mesmo grupo');
  });

  test('os valores gravados somam exatamente o preço do pacote', async () => {
    const { r } = await comprar();
    const ags = r.corpo.agendamentos;
    // 100/150 e 50/150 de R$ 130.
    assert.deepEqual(ags.map(a => a.valor).sort((x, y) => y - x), [86.67, 43.33]);
    assert.equal(Math.round(ags.reduce((n, a) => n + a.valor, 0) * 100), 13000);
  });

  test('o horário oferecido é o que cabe no pacote inteiro', async () => {
    const { corpo: combo } = await novoCombo();
    const { corpo } = await api.anonimo()(
      'GET', `/api/publico/horarios?comboId=${combo.id}&data=${DIA}`);
    const p1 = corpo.porProfissional.find(p => p.profissionalId === 'p1');
    // 90 minutos seguidos, jornada até 18:00: o último começo possível é 16:30.
    assert.equal(p1.horarios.at(-1), '16:30');
    assert.ok(!corpo.porProfissional.some(p => p.profissionalId === 'p2'),
      'a Bia não faz sobrancelha, então não faz este combo');
  });

  test('o calendário do mês usa a duração do pacote', async () => {
    const { corpo: combo } = await novoCombo();
    const { corpo } = await api.anonimo()(
      'GET', `/api/publico/dias-livres?comboId=${combo.id}&mes=2027-03`);
    assert.ok(corpo.dias.includes(DIA));
  });

  test('a agenda fica ocupada pelo pacote inteiro', async () => {
    await comprar('09:00');
    const { corpo } = await api.anonimo()(
      'GET', `/api/publico/horarios?servicoId=s1&profissionalId=p1&data=${DIA}`);
    assert.ok(!corpo.horarios.includes('09:00'));
    assert.ok(!corpo.horarios.includes('10:00'), 'o segundo serviço do combo também ocupa');
    assert.ok(corpo.horarios.includes('10:30'));
  });

  test('recusa quem não faz todos os serviços do pacote', async () => {
    const { corpo: combo } = await novoCombo();
    const r = await api.anonimo()('POST', '/api/publico/agendar', {
      nome: 'Outra', fone: '47955553333', nascimento: '1992-02-02',
      comboId: combo.id, profissionalId: 'p2', data: DIA, hora: '09:00',
    });
    assert.equal(r.status, 409);
  });

  test('recusa promoção vencida, mesmo com o id na mão', async () => {
    const { corpo: combo } = await novoCombo(dona, { validoAte: '2020-12-31' });
    const r = await api.anonimo()('POST', '/api/publico/agendar', {
      nome: 'Atrasada', fone: '47955552222', nascimento: '1992-02-02',
      comboId: combo.id, profissionalId: 'p1', data: DIA, hora: '09:00',
    });
    assert.equal(r.status, 409);
  });

  test('não grava metade do pacote quando o segundo horário não cabe', async () => {
    const { corpo: combo } = await novoCombo();
    // 17:30 + 90 min passa das 18:00.
    const r = await api.anonimo()('POST', '/api/publico/agendar', {
      nome: 'Tarde Demais', fone: '47955551111', nascimento: '1992-02-02',
      comboId: combo.id, profissionalId: 'p1', data: DIA, hora: '17:30',
    });
    assert.equal(r.status, 409);
    await db.db.comEmpresa('default', async () => {
      const { n } = await db.db.get('SELECT COUNT(*) n FROM appointments');
      assert.equal(n, 0, 'meio combo gravado é pior do que nenhum');
    });
  });
});

describe('cancelar o combo', () => {
  const comprar = async () => {
    const { corpo: combo } = await novoCombo();
    const r = await api.anonimo()('POST', '/api/publico/agendar', {
      nome: 'Cliente do Combo', fone: '47955554444', nascimento: '1992-02-02',
      comboId: combo.id, profissionalId: 'p1', data: DIA, hora: '09:00',
    });
    return r.corpo.agendamentos;
  };

  test('cancelar um pedaço cancela o pacote', async () => {
    const ags = await comprar();
    // Cancelar metade deixaria a cliente pagando preço de pacote por um
    // serviço só.
    await dona('PUT', `/api/agendamentos/${ags[0].id}`, { status: 'cancelado' });

    const { corpo } = await dona('GET', `/api/agendamentos?data=${DIA}`);
    assert.equal(corpo.length, 2);
    assert.ok(corpo.every(a => a.status === 'cancelado'));
  });

  test('apagar um pedaço apaga o pacote', async () => {
    const ags = await comprar();
    const r = await dona('DELETE', `/api/agendamentos/${ags[1].id}`);
    assert.equal(r.corpo.removidos, 2);

    await db.db.comEmpresa('default', async () => {
      const { n } = await db.db.get('SELECT COUNT(*) n FROM appointments');
      assert.equal(n, 0);
    });
  });

  test('cancelar avulso não arrasta ninguém', async () => {
    await comprar();
    const avulso = await dona('POST', '/api/agendamentos', {
      clienteId: 'c1', servicoId: 's1', profissionalId: 'p2', data: DIA, hora: '14:00',
    });
    await dona('PUT', `/api/agendamentos/${avulso.corpo.id}`, { status: 'cancelado' });

    const { corpo } = await dona('GET', `/api/agendamentos?data=${DIA}`);
    const doCombo = corpo.filter(a => a.comboGrupo);
    assert.ok(doCombo.every(a => a.status === 'agendado'), 'o combo não tem nada com isso');
  });
});
