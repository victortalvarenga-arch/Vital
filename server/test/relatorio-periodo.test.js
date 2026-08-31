import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, cenario, subirApi, criarEquipe } from './ambiente.js';

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
