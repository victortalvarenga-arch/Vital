import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, limparAgenda, cenario, subirApi, criarEquipe } from './ambiente.js';

/**
 * Serviços adicionais: o que o painel sabia menos que o site.
 *
 * Dois defeitos do Bloco 6c, achados depois e registrados como dívida:
 *
 * 1. **O extra aparecia sozinho na vitrine.** "Depilação de buço", cadastrada
 *    para vender junto da limpeza, ia parar na lista da categoria dela,
 *    agendável por três minutos.
 * 2. **O ranking creditava o extra ao serviço principal.** `valor` já traz os
 *    adicionais somados — de propósito, para o motor e o caixa lerem um número
 *    só —, e o "o que mais dá dinheiro" herdava isso sem separar.
 */

const DIA = '2027-03-05';

let db, api, dona;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
    // Corte R$ 100 (principal) + Buço R$ 30 (extra), oferecido na Limpeza.
    await db.db.run(
      `INSERT INTO services (id,nome,categoria,preco,duracao,intervalo,ativo,ordem)
       VALUES ('x1','Depilação de buço','Rosto',30,15,0,1,1)`
    );
    await db.salvarVinculos('x1', ['p1']);
    await db.db.run(`INSERT INTO service_addons (service_id, addon_id) VALUES ('s1','x1')`);
  });
  ({ dono: dona } = await criarEquipe(api));
});

after(async () => {
  await api.fechar();
  await db.pool.end();
});

beforeEach(async () => {
  await db.db.comEmpresa('default', async () => {
    await limparAgenda(db);
    await db.db.run(`UPDATE services SET somente_adicional = 0`);
  });
});

const marcarComoSoExtra = () =>
  dona('PUT', '/api/servicos/x1', { somenteAdicional: true });

describe('vender só como adicional', () => {
  test('some da vitrine sem deixar de existir', async () => {
    const antes = (await api.anonimo()('GET', '/api/publico/vitrine')).corpo;
    assert.ok(antes.servicos.some(s => s.id === 'x1'), 'antes, aparecia sozinho');

    assert.equal((await marcarComoSoExtra()).status, 200);

    const depois = (await api.anonimo()('GET', '/api/publico/vitrine')).corpo;
    const x = depois.servicos.find(s => s.id === 'x1');
    assert.ok(x, 'continua na resposta — o passo de adicionais precisa do nome e do preço');
    assert.equal(x.somenteAdicional, true, 'marcado, para o site não o listar sozinho');
  });

  test('continua valendo como extra', async () => {
    await marcarComoSoExtra();
    const r = await api.anonimo()('POST', '/api/publico/agendar', {
      nome: 'Cliente Nova', fone: '47966665555', nascimento: '1990-01-01',
      servicoId: 's1', profissionalId: 'p1', data: DIA, hora: '10:00',
      adicionaisIds: ['x1'],
    });
    assert.equal(r.status, 201);
    assert.equal(r.corpo.agendamento.valor, 130);
  });

  test('não pode ser o serviço principal, nem com o id na mão', async () => {
    await marcarComoSoExtra();
    // Esconder da lista nunca foi controle: id de serviço circula.
    const r = await api.anonimo()('POST', '/api/publico/agendar', {
      nome: 'Outra', fone: '47966664444', nascimento: '1990-01-01',
      servicoId: 'x1', profissionalId: 'p1', data: DIA, hora: '14:00',
    });
    assert.equal(r.status, 409);
    assert.match(r.corpo.erro, /só é vendido junto/);
  });

  test('nem pelo encaixe do painel', async () => {
    await marcarComoSoExtra();
    const r = await dona('POST', '/api/agendamentos', {
      clienteId: 'c1', servicoId: 'x1', profissionalId: 'p1', data: DIA, hora: '15:00',
    });
    assert.equal(r.status, 409);
  });

  test('desmarcar volta a permitir a venda avulsa', async () => {
    await marcarComoSoExtra();
    await dona('PUT', '/api/servicos/x1', { somenteAdicional: false });
    const r = await dona('POST', '/api/agendamentos', {
      clienteId: 'c1', servicoId: 'x1', profissionalId: 'p1', data: DIA, hora: '15:00',
    });
    assert.equal(r.status, 201);
  });

  test('arquivar continua sendo outra coisa', async () => {
    // `ativo = 0` quer dizer arquivado, e o motor recusa arquivado como extra.
    // Se os dois sentidos morassem no mesmo campo, a empresa perderia as duas
    // possibilidades de uma vez.
    await marcarComoSoExtra();
    await db.db.comEmpresa('default', async () => {
      const s = await db.db.get(`SELECT ativo, somente_adicional FROM services WHERE id='x1'`);
      assert.equal(s.ativo, 1);
      assert.equal(s.somente_adicional, 1);
    });
  });
});

describe('o ranking do financeiro', () => {
  /** Vende Corte (100) com o extra Buço (30) e conclui, para entrar no relatório. */
  const venderEConcluir = async (hora = '10:00') => {
    const r = await api.anonimo()('POST', '/api/publico/agendar', {
      nome: 'Cliente Nova', fone: '47966665555', nascimento: '1990-01-01',
      servicoId: 's1', profissionalId: 'p1', data: DIA, hora,
      adicionaisIds: ['x1'],
    });
    await dona('PUT', `/api/agendamentos/${r.corpo.agendamento.id}`,
      { status: 'concluido', pagamento: { status: 'pago', forma: 'pix' } });
    return r.corpo.agendamento;
  };

  test('o extra vale pelo próprio serviço, não pelo principal', async () => {
    await venderEConcluir();
    const { corpo } = await dona('GET', '/api/relatorios/resumo?mes=2027-03');

    const porNome = Object.fromEntries(corpo.porServico.map(s => [s.nome, s.total]));
    assert.equal(porNome['Corte'], 100, 'o principal fica com o preço dele');
    assert.equal(porNome['Depilação de buço'], 30, 'e o extra, com o dele');
  });

  test('a soma das linhas continua batendo com o caixa', async () => {
    // Separar não pode inventar nem sumir com dinheiro: é atribuição, não conta
    // nova. Sem esta garantia, o ranking passaria a discordar do recebido.
    await venderEConcluir('10:00');
    await venderEConcluir('14:00');

    const { corpo } = await dona('GET', '/api/relatorios/resumo?mes=2027-03');
    const soma = corpo.porServico.reduce((n, s) => n + Number(s.total), 0);
    assert.equal(soma, corpo.recebido);
    assert.equal(soma, 260, 'dois atendimentos de R$ 130');
  });

  test('atendimento sem extra não muda de lugar', async () => {
    const r = await api.anonimo()('POST', '/api/publico/agendar', {
      nome: 'Sem Extra', fone: '47966663333', nascimento: '1990-01-01',
      servicoId: 's1', profissionalId: 'p1', data: DIA, hora: '16:00',
    });
    await dona('PUT', `/api/agendamentos/${r.corpo.agendamento.id}`,
      { status: 'concluido', pagamento: { status: 'pago', forma: 'pix' } });

    const { corpo } = await dona('GET', '/api/relatorios/resumo?mes=2027-03');
    assert.deepEqual(corpo.porServico.map(s => [s.nome, Number(s.total)]), [['Corte', 100]]);
  });
});
