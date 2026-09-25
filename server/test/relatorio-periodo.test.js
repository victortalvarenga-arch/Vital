import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, cenario, subirApi, criarEquipe, agendar } from './ambiente.js';

/**
 * `previsto` e `agendados` no resumo de um período.
 *
 * A tela de Resumo passou a ter escala (dia, semana, mês) e a navegar para
 * trás. Os dois números que ela mostra no topo — quanto o período deve render
 * e quantos atendimentos tem — não existiam na rota: havia só `previstoHoje`,
 * que responde "quanto ainda entra hoje" e vale zero para quem está olhando a
 * semana passada.
 *
 * Calcular isso no navegador não servia: `/api/estado` só devolve 120 dias
 * para trás, então um mês mais antigo daria zero em silêncio — número errado
 * com cara de número certo, na tela de dinheiro.
 */

const DIA = '2027-03-05';       // uma sexta-feira
const OUTRO = '2027-03-06';

let db, api, dona, funcionaria;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
  });
  ({ dono: dona, ana: funcionaria } = await criarEquipe(api));
});

after(async () => {
  await api.fechar();
  await db.pool.end();
});

/** Marca um atendimento e o deixa no status pedido. */
async function marcar({ hora, data = DIA, status, pago = false, prof = 'p1' }) {
  const r = await api.anonimo()('POST', '/api/publico/agendar', {
    nome: 'Cliente ' + hora, fone: '4796660' + hora.replace(':', ''),
    nascimento: '1990-01-01', servicoId: 's1', profissionalId: prof, data, hora,
  });
  assert.equal(r.status, 201, r.corpo?.erro);
  const id = r.corpo.agendamento.id;
  if (status && status !== 'agendado') {
    await dona('PUT', `/api/agendamentos/${id}`, {
      status, ...(pago ? { pagamento: { status: 'pago', forma: 'pix' } } : {}),
    });
  }
  return r.corpo.agendamento;
}

describe('resumo de um período', () => {
  test('previsto conta o que não foi cancelado; recebido, só o que entrou', async () => {
    await marcar({ hora: '09:00', status: 'concluido', pago: true });  // 100, recebido
    await marcar({ hora: '10:00', status: 'concluido' });              // 100, concluído sem pagar
    await marcar({ hora: '11:00' });                                   // 100, ainda agendado
    await marcar({ hora: '14:00', status: 'falta' });                  // 100, faltou
    await marcar({ hora: '15:00', status: 'cancelado' });              // 100, fora da conta

    const { corpo } = await dona('GET', `/api/relatorios/resumo?de=${DIA}&ate=${DIA}`);

    assert.equal(corpo.recebido, 100, 'só o concluído e pago');
    assert.equal(corpo.previsto, 400, 'os quatro não cancelados, o que faltou incluído');
    assert.equal(corpo.agendados, 4, 'cancelado não ocupou ninguém');
    assert.equal(corpo.atendimentos, 2, 'concluídos, pagos ou não');
    assert.equal(corpo.faltas, 1);
    assert.equal(corpo.cancelados, 1);
  });

  test('o ticket médio divide o recebido pelos concluídos', async () => {
    const { corpo } = await dona('GET', `/api/relatorios/resumo?de=${DIA}&ate=${DIA}`);
    assert.equal(corpo.ticketMedio, corpo.recebido / corpo.atendimentos);
  });

  test('o intervalo recorta de verdade: o dia seguinte não entra', async () => {
    await marcar({ hora: '09:00', data: OUTRO, status: 'concluido', pago: true });

    const so = await dona('GET', `/api/relatorios/resumo?de=${DIA}&ate=${DIA}`);
    const dois = await dona('GET', `/api/relatorios/resumo?de=${DIA}&ate=${OUTRO}`);

    assert.equal(so.corpo.agendados, 4, 'o dia sozinho não enxerga o vizinho');
    assert.equal(dois.corpo.agendados, 5, 'a semana enxerga os dois');
    assert.equal(dois.corpo.recebido, 200);
  });

  test('funcionário vê só a própria produção nos números novos', async () => {
    // O recorte precisa valer nos campos novos como vale nos antigos — deixar
    // um de fora vazaria o faturamento da empresa numa linha só.
    await marcar({ hora: '16:00', status: 'concluido', pago: true, prof: 'p2' });

    const dono = await dona('GET', `/api/relatorios/resumo?de=${DIA}&ate=${DIA}`);
    const dela = await funcionaria('GET', `/api/relatorios/resumo?de=${DIA}&ate=${DIA}`);

    assert.equal(dono.corpo.agendados, 5, 'o dono vê os dois profissionais');
    assert.equal(dela.corpo.agendados, 4, 'a funcionária, só os dela');
    assert.ok(dela.corpo.previsto < dono.corpo.previsto, 'e o previsto acompanha');
    assert.equal(dela.corpo.somenteMeu, true);
  });
});

describe('filtrar por profissional', () => {
  test('o dono recorta a empresa numa pessoa de cada vez', async () => {
    const tudo = await dona('GET', `/api/relatorios/resumo?de=${DIA}&ate=${DIA}`);
    const soP1 = await dona('GET', `/api/relatorios/resumo?de=${DIA}&ate=${DIA}&profissionalId=p1`);
    const soP2 = await dona('GET', `/api/relatorios/resumo?de=${DIA}&ate=${DIA}&profissionalId=p2`);

    assert.equal(soP1.corpo.agendados + soP2.corpo.agendados, tudo.corpo.agendados,
      'as partes somam o todo');
    assert.equal(soP1.corpo.profissionalId, 'p1');
    assert.equal(soP1.corpo.porProfissional.length, 1, 'o ranking acompanha o recorte');
    assert.equal(soP1.corpo.porProfissional[0].id, 'p1');
    assert.equal(soP1.corpo.somenteMeu, false,
      'filtrar por escolha não é o mesmo que estar limitado pelo papel');
  });

  test('funcionário não espia a colega passando o id na URL', async () => {
    // O parâmetro é conveniência de quem já podia ver tudo. Para quem não
    // podia, `escopoDe` continua mandando — senão bastava adivinhar um id na
    // barra de endereço para ler o faturamento alheio.
    const dela = await funcionaria('GET', `/api/relatorios/resumo?de=${DIA}&ate=${DIA}`);
    const tentando = await funcionaria('GET', `/api/relatorios/resumo?de=${DIA}&ate=${DIA}&profissionalId=p2`);

    assert.equal(tentando.status, 200, 'não precisa dar erro — precisa é não obedecer');
    assert.deepEqual(tentando.corpo.porProfissional, dela.corpo.porProfissional);
    assert.equal(tentando.corpo.recebido, dela.corpo.recebido);
    assert.equal(tentando.corpo.profissionalId, 'p1', 'continua sendo o escopo dela');
    assert.equal(tentando.corpo.somenteMeu, true);
  });
});

describe('filtrar a lista por estado', () => {
  test('um estado só, e mais de um separado por vírgula', async () => {
    // A tela de Agendamentos mostra quatro estados, mas o banco tem cinco:
    // "agendado" ali quer dizer agendado OU confirmado — quem tem hora marcada
    // e ainda não foi atendida. Sem aceitar os dois, a aba esconderia metade.
    const so = await dona('GET', `/api/agendamentos?de=${DIA}&ate=${DIA}&status=falta`);
    const dois = await dona('GET', `/api/agendamentos?de=${DIA}&ate=${DIA}&status=agendado,confirmado`);
    const tudo = await dona('GET', `/api/agendamentos?de=${DIA}&ate=${DIA}`);

    assert.ok(so.corpo.every(a => a.status === 'falta'));
    assert.ok(dois.corpo.every(a => ['agendado', 'confirmado'].includes(a.status)));
    assert.ok(dois.corpo.length > 0, 'o cenário tem agendamento em aberto');
    assert.ok(tudo.corpo.length > dois.corpo.length, 'sem filtro vem mais');
  });

  test('estado inexistente é ignorado, não devolve lista vazia', async () => {
    // Vazio pareceria resposta legítima — "não há nada nesse estado" — quando
    // na verdade o parâmetro estava errado.
    const inventado = await dona('GET', `/api/agendamentos?de=${DIA}&ate=${DIA}&status=inventado`);
    const tudo = await dona('GET', `/api/agendamentos?de=${DIA}&ate=${DIA}`);
    assert.equal(inventado.corpo.length, tudo.corpo.length);
  });
});

describe('lucro do dono e ranking do mês', () => {
  const MES = '2027-04';
  const D = `${MES}-05`;

  test('lucro é o recebido menos as comissões, arredondadas por atendimento', async () => {
    // Comissão de 33,333% (a coluna guarda duas casas: vira 33,33) sobre 100:
    // 33,33 por atendimento. O teste de arredondamento, com centavos, é o de baixo.
    await db.db.comEmpresa('default', () =>
      db.db.run(`UPDATE staff SET comissao = 33.333 WHERE id = 'p1'`));
    await marcar({ hora: '09:00', data: D, status: 'concluido', pago: true, prof: 'p1' });
    await marcar({ hora: '10:00', data: D, status: 'concluido', pago: true, prof: 'p1' });
    await marcar({ hora: '11:00', data: D, status: 'concluido', pago: true, prof: 'p2' }); // sem comissão

    const { corpo } = await dona('GET', `/api/relatorios/resumo?mes=${MES}`);
    assert.equal(corpo.recebido, 300);
    assert.equal(corpo.lucro, 300 - 66.66, 'duas comissões de 33,33, não 66,67');
  });

  test('a comissão é arredondada por atendimento, e a sobra fica com a empresa', async () => {
    // Dois atendimentos de 10,10 a 33,33%: cada comissão vale 3,36633 e vira
    // 3,37 — 6,74 no total. Somar primeiro e arredondar depois daria 6,73, e o
    // lucro do dono discordaria da soma do que foi pago a cada um.
    const MES2 = '2027-06';
    const D2 = `${MES2}-05`;
    await db.db.comEmpresa('default', () =>
      db.db.run(`UPDATE staff SET comissao = 33.33 WHERE id = 'p1'`));
    const a = await marcar({ hora: '09:00', data: D2, status: 'concluido', pago: true, prof: 'p1' });
    const b = await marcar({ hora: '10:00', data: D2, status: 'concluido', pago: true, prof: 'p1' });
    await db.db.comEmpresa('default', () =>
      db.db.run(`UPDATE appointments SET valor = 10.10 WHERE id IN (?, ?)`, a.id, b.id));

    const { corpo } = await dona('GET', `/api/relatorios/resumo?mes=${MES2}`);
    assert.equal(corpo.recebido, 20.2);
    assert.equal(corpo.lucro, 13.46, '20,20 menos 2 × 3,37');
  });

  test('só o que entrou conta: concluído sem pagar não gera comissão no lucro', async () => {
    await marcar({ hora: '14:00', data: D, status: 'concluido', prof: 'p1' }); // não pago
    const { corpo } = await dona('GET', `/api/relatorios/resumo?mes=${MES}`);
    assert.equal(corpo.lucro, 300 - 66.66, 'a base é a mesma do recebido');
  });

  test('funcionário não recebe o lucro, e o dono filtrado vê o da pessoa', async () => {
    const dela = await funcionaria('GET', `/api/relatorios/resumo?mes=${MES}`);
    assert.equal(dela.corpo.lucro, null, 'a comissão dos colegas não é dela');

    const soP1 = await dona('GET', `/api/relatorios/resumo?mes=${MES}&profissionalId=p1`);
    assert.equal(soP1.corpo.lucro, 200 - 66.66);
  });

  test('o ranking do mês ordena por atendimentos e mostra o valor só ao dono', async () => {
    const dono = await dona('GET', `/api/relatorios/ranking?mes=${MES}`);
    assert.deepEqual(dono.corpo.ranking.map(l => [l.id, l.qtd]), [['p1', 3], ['p2', 1]]);
    // Atendimento concluído conta no ranking mesmo sem pagar (é trabalho feito):
    // são três da Ana, um deles ainda em aberto.
    assert.equal(dono.corpo.ranking[0].producao, 300);

    // A funcionária vê a equipe toda, para o ranking servir — mas só contagem.
    const dela = await funcionaria('GET', `/api/relatorios/ranking?mes=${MES}`);
    assert.equal(dela.status, 200);
    assert.deepEqual(dela.corpo.ranking.map(l => [l.id, l.qtd]), [['p1', 3], ['p2', 1]]);
    assert.ok(dela.corpo.ranking.every(l => !('producao' in l)),
      'nenhum valor pode chegar a quem está sob escopo');
  });

  test('o ranking é do mês pedido: outro mês não entra', async () => {
    const { corpo } = await dona('GET', `/api/relatorios/ranking?mes=2027-05`);
    assert.deepEqual(corpo.ranking, []);
  });
});

describe('gráfico dos últimos 12 meses', () => {
  let atual, ha11, ha12;

  /** 'YYYY-MM' de `n` meses antes de `mes` — a conta é do teste, independente da do servidor. */
  const mesesAntes = (mes, n) => {
    const [a, m] = mes.split('-').map(Number);
    const total = a * 12 + (m - 1) - n;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  };

  const concluidoPago = async (data, hora, prof, pago = true) => {
    await agendar(db, { prof, data, hora, status: 'concluido' });
    await db.db.run(
      `UPDATE appointments SET pag_status = ? WHERE id = ?`,
      pago ? 'pago' : 'aberto', `a-${data}-${hora}-${prof}`
    );
  };

  before(async () => {
    const { hoje } = await import('../src/lib/dates.js');
    atual = hoje().slice(0, 7);
    ha11 = mesesAntes(atual, 11);
    ha12 = mesesAntes(atual, 12);

    await db.db.comEmpresa('default', async () => {
      await db.db.run('DELETE FROM appointments');
      await db.db.run(`UPDATE staff SET comissao = 40 WHERE id = 'p1'`);
      await db.db.run(`UPDATE staff SET comissao = 0 WHERE id = 'p2'`);

      await concluidoPago(`${atual}-01`, '09:00', 'p1');          // 100, comissão 40 → lucro 60
      await concluidoPago(`${atual}-01`, '10:00', 'p2');          // 100, sem comissão → lucro 100
      await concluidoPago(`${atual}-01`, '11:00', 'p1', false);   // concluído e não pago: fora
      await concluidoPago(`${ha11}-15`, '09:00', 'p1');           // o mais antigo que ainda entra
      await concluidoPago(`${ha12}-15`, '09:00', 'p1');           // um mês além: não entra
    });
  });

  test('são sempre 12 meses, do mais antigo ao atual, com zero nos vazios', async () => {
    const { corpo } = await dona('GET', '/api/relatorios/mensal');
    assert.equal(corpo.meses.length, 12);
    assert.equal(corpo.meses[0].mes, ha11);
    assert.equal(corpo.meses[11].mes, atual);
    assert.ok(!corpo.meses.some(m => m.mes === ha12), 'o décimo segundo mês atrás fica de fora');
    assert.deepEqual(corpo.meses.slice(1, 11).map(m => [m.recebido, m.lucro]),
      Array(10).fill([0, 0]), 'mês sem venda vem zerado, não some');
  });

  test('lucro é recebido menos comissão, e só conta o que foi pago', async () => {
    const { corpo } = await dona('GET', '/api/relatorios/mensal');
    assert.deepEqual(
      [corpo.meses[11].recebido, corpo.meses[11].lucro], [200, 160],
      'o concluído sem pagar não entra, nem no faturamento nem na comissão');
    assert.deepEqual([corpo.meses[0].recebido, corpo.meses[0].lucro], [100, 60]);
  });

  test('o dono recorta numa pessoa, e o funcionário só vê o faturamento dele', async () => {
    const soP2 = await dona('GET', '/api/relatorios/mensal?profissionalId=p2');
    assert.deepEqual([soP2.corpo.meses[11].recebido, soP2.corpo.meses[11].lucro], [100, 100]);

    const dela = await funcionaria('GET', '/api/relatorios/mensal');
    assert.equal(dela.corpo.somenteMeu, true);
    assert.equal(dela.corpo.meses[11].recebido, 100, 'só o que a Ana atendeu e recebeu');
    assert.ok(dela.corpo.meses.every(m => m.lucro === null),
      'lucro é do dono: a comissão dos colegas não é dela');
  });

  test('funcionário não espia a colega passando o id na URL', async () => {
    const tentando = await funcionaria('GET', '/api/relatorios/mensal?profissionalId=p2');
    assert.equal(tentando.corpo.meses[11].recebido, 100, 'continua sendo o escopo dela');
    assert.equal(tentando.corpo.profissionalId, 'p1');
  });
});

describe('série do gráfico do Financeiro', () => {
  const DE = '2027-05-01';
  const ATE = '2027-05-07';

  const concluidoPago = async (data, hora, prof) => {
    await agendar(db, { prof, data, hora, status: 'concluido' });
    await db.db.run(
      `UPDATE appointments SET pag_status = 'pago' WHERE id = ?`, `a-${data}-${hora}-${prof}`
    );
  };

  before(async () => {
    await db.db.comEmpresa('default', async () => {
      await db.db.run('DELETE FROM appointments');
      await db.db.run(`UPDATE staff SET comissao = 40 WHERE id = 'p1'`);
      await db.db.run(`UPDATE staff SET comissao = 0 WHERE id = 'p2'`);

      await concluidoPago('2027-05-03', '09:00', 'p1');   // 100, custos 40, lucro 60
      await concluidoPago('2027-05-03', '10:00', 'p2');   // 100, sem comissão
      await concluidoPago('2027-05-04', '21:00', 'p2');   // 100, depois do horário comercial
      await concluidoPago('2027-05-05', '15:00', 'p1');   // 100, custos 40, lucro 60
    });
  });

  const serie = (q, quem = dona) => quem('GET', `/api/relatorios/serie?${q}`);

  test('por dia: um ponto para cada dia do período, zerado onde não houve venda', async () => {
    const { corpo } = await serie(`por=dia&de=${DE}&ate=${ATE}`);
    assert.deepEqual(corpo.pontos.map(p => p.chave),
      ['2027-05-01', '2027-05-02', '2027-05-03', '2027-05-04', '2027-05-05', '2027-05-06', '2027-05-07']);
    const dia = d => corpo.pontos.find(p => p.chave === d);
    assert.deepEqual([dia('2027-05-03').receita, dia('2027-05-03').custos, dia('2027-05-03').lucro], [200, 40, 160]);
    assert.deepEqual([dia('2027-05-05').receita, dia('2027-05-05').custos, dia('2027-05-05').lucro], [100, 40, 60]);
    assert.deepEqual([dia('2027-05-02').receita, dia('2027-05-02').custos, dia('2027-05-02').lucro], [0, 0, 0]);
  });

  test('por hora: horário comercial, esticado para caber a venda das 21h', async () => {
    const util = await serie(`por=hora&de=2027-05-03&ate=2027-05-03`);
    assert.equal(util.corpo.pontos[0].chave, '08');
    assert.equal(util.corpo.pontos.at(-1).chave, '19', 'sem venda fora do expediente, o eixo fica em 8h–19h');
    const h9 = util.corpo.pontos.find(p => p.chave === '09');
    assert.deepEqual([h9.receita, h9.custos, h9.lucro], [100, 40, 60]);

    const tarde = await serie(`por=hora&de=2027-05-04&ate=2027-05-04`);
    assert.equal(tarde.corpo.pontos.at(-1).chave, '21', 'a venda das 21h não fica de fora do eixo');
    assert.equal(tarde.corpo.pontos.find(p => p.chave === '21').receita, 100);
  });

  test('por mês: doze pontos no ano, e a soma bate com o resumo do mesmo período', async () => {
    const { corpo } = await serie('por=mes&de=2027-01-01&ate=2027-12-31');
    assert.equal(corpo.pontos.length, 12);
    assert.equal(corpo.pontos.find(p => p.chave === '2027-05').receita, 400);

    // O gráfico e os cartões precisam contar a mesma coisa.
    const dia = await serie(`por=dia&de=2027-05-01&ate=2027-05-31`);
    const resumo = await dona('GET', '/api/relatorios/resumo?de=2027-05-01&ate=2027-05-31');
    const soma = k => dia.corpo.pontos.reduce((s, p) => s + p[k], 0);
    assert.equal(soma('receita'), resumo.corpo.recebido);
    assert.equal(soma('custos'), resumo.corpo.custos);
    assert.equal(soma('lucro'), resumo.corpo.lucro);
    assert.deepEqual([resumo.corpo.recebido, resumo.corpo.custos, resumo.corpo.lucro], [400, 80, 320]);
  });

  test('funcionário vê só o dela, com os custos dela (a comissão) e sem lucro', async () => {
    const dela = await serie(`por=dia&de=${DE}&ate=${ATE}`, funcionaria);
    assert.equal(dela.corpo.somenteMeu, true);
    const d3 = dela.corpo.pontos.find(p => p.chave === '2027-05-03');
    assert.deepEqual([d3.receita, d3.custos, d3.lucro], [100, 40, null]);
    assert.ok(dela.corpo.pontos.every(p => p.lucro === null), 'lucro da empresa não é dela');

    const resumo = await funcionaria('GET', '/api/relatorios/resumo?de=2027-05-01&ate=2027-05-31');
    assert.deepEqual([resumo.corpo.recebido, resumo.corpo.custos, resumo.corpo.lucro], [200, 80, null]);

    const espiando = await serie(`por=dia&de=${DE}&ate=${ATE}&profissionalId=p2`, funcionaria);
    assert.equal(espiando.corpo.pontos.find(p => p.chave === '2027-05-03').receita, 100,
      'o id da colega na URL não é obedecido');
  });

  test('o dono recorta numa pessoa', async () => {
    const { corpo } = await serie(`por=dia&de=${DE}&ate=${ATE}&profissionalId=p2`);
    const d3 = corpo.pontos.find(p => p.chave === '2027-05-03');
    assert.deepEqual([d3.receita, d3.custos, d3.lucro], [100, 0, 100]);
  });

  test('pedido mal feito é recusado, sem consultar o banco por nada', async () => {
    assert.equal((await serie(`por=semana&de=${DE}&ate=${ATE}`)).status, 400, 'degrau desconhecido');
    assert.equal((await serie(`por=dia&de=${ATE}&ate=${DE}`)).status, 400, 'de depois de ate');
    assert.equal((await serie(`por=dia&de=ontem&ate=hoje`)).status, 400, 'data que não é data');
    assert.equal((await serie(`por=dia&de=2025-01-01&ate=2027-12-31`)).status, 400,
      'mais de 400 dias por dia é um gráfico ilegível');
  });
});
