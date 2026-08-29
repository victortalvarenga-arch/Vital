import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, limparAgenda, cenario, subirApi, criarEquipe, comoAdmin, SENHA } from './ambiente.js';

/**
 * O registro do painel: quem fez o quê, dentro da empresa.
 *
 * A plataforma tinha auditoria desde o Bloco 2; a empresa-cliente, nada. Com
 * funcionários no painel, botão de excluir e arrastar para remarcar, "sumiu um
 * agendamento e ninguém sabe" era questão de tempo — e a resposta seria "não dá
 * para saber".
 *
 * O que estes testes seguram: que a ação **e** o autor sobrevivam, inclusive
 * quando o alvo é apagado e quando o autor perde o acesso. Registro que some
 * junto com o que ele registrava não serve para nada.
 */

const DIA = '2027-03-05';

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
  await db.db.comEmpresa('default', () => limparAgenda(db));
  // Pela conexão de administrador: a aplicação não pode apagar registro, e é
  // exatamente essa a garantia que este arquivo testa mais abaixo.
  await comoAdmin(`DELETE FROM logs WHERE tenant_id = 'default'`);
});

const logs = async (quem = dona, q = '') => (await quem('GET', '/api/logs' + q)).corpo;

describe('a agenda deixa rastro', () => {
  const marcar = (hora = '10:00', prof = 'p1') => dona('POST', '/api/agendamentos', {
    clienteId: 'c1', servicoId: 's1', profissionalId: prof, data: DIA, hora,
  });

  test('encaixe, remarcação, cancelamento e pagamento têm ações distintas', async () => {
    const { corpo: a } = await marcar();
    await dona('PUT', `/api/agendamentos/${a.id}`, { hora: '15:00' });
    await dona('PUT', `/api/agendamentos/${a.id}`, {
      status: 'concluido', pagamento: { status: 'pago', forma: 'pix' },
    });
    await dona('PUT', `/api/agendamentos/${a.id}`, { status: 'cancelado' });

    const acoes = (await logs()).map(l => l.acao);
    // Três perguntas diferentes de procurar depois: o horário que mudou, o
    // dinheiro que entrou, e a cliente que não vem mais.
    assert.deepEqual(acoes, [
      'agendamento.cancelado', 'agendamento.pago',
      'agendamento.remarcado', 'agendamento.criado',
    ], 'mais recente primeiro');
  });

  test('a frase diz o que aconteceu, sem precisar do id', async () => {
    const { corpo: a } = await marcar();
    await dona('PUT', `/api/agendamentos/${a.id}`, { data: '2027-03-08', hora: '16:00' });

    const l = (await logs()).find(x => x.acao === 'agendamento.remarcado');
    assert.match(l.resumo, /remarcou Cliente de 2027-03-05 10:00 para 2027-03-08 16:00/);
    assert.deepEqual(l.detalhe.data, ['2027-03-05', '2027-03-08']);
    assert.equal(l.usuario, 'Dona');
  });

  test('apagar o agendamento não apaga a memória de que ele existiu', async () => {
    // É o caso que motiva o registro inteiro: depois do DELETE não há mais o
    // que consultar, e o rastro é a única coisa que sobra.
    const { corpo: a } = await marcar('11:00');
    await dona('DELETE', `/api/agendamentos/${a.id}`);

    const l = (await logs()).find(x => x.acao === 'agendamento.apagado');
    assert.ok(l, 'nada some sem deixar registro');
    assert.match(l.resumo, /apagou o horário de Cliente/);
    assert.equal(l.detalhe.hora, '11:00');
  });

  test('alteração que não muda nada não vira linha', async () => {
    const { corpo: a } = await marcar();
    const antes = (await logs()).length;
    await dona('PUT', `/api/agendamentos/${a.id}`, {});
    // Um PUT que não mudou campo nenhum ainda registra "alterado" — é o preço
    // de registrar por rota. O que não pode é o cadastro fazer isso.
    await dona('PUT', '/api/clientes/c1', { nome: 'Cliente Um' });
    const depois = await logs();
    assert.ok(!depois.some(l => l.acao === 'cliente.alterado'),
      'salvar sem mudar nada não enche o registro');
    assert.ok(depois.length >= antes);
  });
});

describe('cadastro e acesso deixam rastro', () => {
  test('editar cliente registra quais campos mudaram', async () => {
    await dona('PUT', '/api/clientes/c1', { nome: 'Cliente Renomeada', optin: false });
    const l = (await logs()).find(x => x.acao === 'cliente.alterado');
    assert.deepEqual(Object.keys(l.detalhe).sort(), ['nome', 'optin']);
    // `optin` é consentimento de marketing: quem o desligou é o que a LGPD pede.
    assert.deepEqual(l.detalhe.optin, [true, false]);
  });

  test('mudar o preço de um serviço fica registrado', async () => {
    // É a mudança que mais gera pergunta depois, e a que ninguém lembra.
    await dona('PUT', '/api/servicos/s1', { preco: 150 });
    const l = (await logs()).find(x => x.acao === 'servico.alterado');
    assert.deepEqual(l.detalhe.preco, [100, 150]);
    await dona('PUT', '/api/servicos/s1', { preco: 100 });
  });

  test('dar e tirar acesso é registrado', async () => {
    const nova = await dona('POST', '/api/auth/usuarios', {
      nome: 'Temporária', email: 'temp@teste.com', senha: SENHA,
      papel: 'funcionario', profissionalId: 'p2',
    });
    await dona('DELETE', `/api/auth/usuarios/${nova.corpo.id}`);

    const acoes = (await logs()).map(l => l.acao);
    assert.ok(acoes.includes('acesso.criado'));
    assert.ok(acoes.includes('acesso.removido'));
  });

  test('o nome de quem fez sobrevive à remoção do acesso', async () => {
    // O histórico precisa continuar dizendo quem cancelou aquele horário
    // justamente no dia em que a pessoa sai — que é quando ele importa.
    const nova = await dona('POST', '/api/auth/usuarios', {
      nome: 'Passageira', email: 'passa@teste.com', senha: SENHA,
      papel: 'funcionario', profissionalId: 'p2',
    });
    const ela = await api.entrar('passa@teste.com', SENHA);
    await ela('POST', '/api/agendamentos', {
      clienteId: 'c1', servicoId: 's1', profissionalId: 'p2', data: DIA, hora: '09:00',
    });
    await dona('DELETE', `/api/auth/usuarios/${nova.corpo.id}`);

    const l = (await logs()).find(x => x.acao === 'agendamento.criado');
    assert.equal(l.usuario, 'Passageira', 'o nome fica congelado no registro');
  });
});

describe('quem vê o quê', () => {
  test('funcionário vê só o próprio rastro', async () => {
    await dona('POST', '/api/agendamentos', {
      clienteId: 'c1', servicoId: 's1', profissionalId: 'p2', data: DIA, hora: '09:00',
    });
    await ana('POST', '/api/agendamentos', {
      clienteId: 'c1', servicoId: 's1', profissionalId: 'p1', data: DIA, hora: '14:00',
    });

    const dela = await logs(ana);
    assert.ok(dela.length > 0);
    assert.ok(dela.every(l => l.usuario === 'Ana'), 'não enxerga o que a dona fez');

    const daDona = await logs(dona);
    assert.ok(daDona.some(l => l.usuario === 'Ana'), 'a dona vê o de todos');
    assert.ok(daDona.some(l => l.usuario === 'Dona'));
  });

  test('o recorte não vem do que o front pediu', async () => {
    await dona('POST', '/api/agendamentos', {
      clienteId: 'c1', servicoId: 's1', profissionalId: 'p2', data: DIA, hora: '09:00',
    });
    // Nem pedindo por um alvo que é da dona.
    const dela = await logs(ana, '?acao=agendamento');
    assert.ok(dela.every(l => l.usuario === 'Ana'));
  });

  test('sem login não há registro para ninguém', async () => {
    assert.equal((await api.anonimo()('GET', '/api/logs')).status, 401);
  });

  test('o site não gera registro — não há autor', async () => {
    await api.anonimo()('POST', '/api/publico/agendar', {
      nome: 'Cliente do Site', fone: '47955551111', nascimento: '1990-01-01',
      servicoId: 's1', profissionalId: 'p1', data: DIA, hora: '11:00',
    });
    const tudo = await logs();
    assert.equal(tudo.length, 0, 'a cliente que agenda não é "quem fez algo no painel"');
  });
});

describe('o registro não se reescreve', () => {
  test('a aplicação não pode alterar nem apagar linha do registro', async () => {
    await dona('PUT', '/api/clientes/c1', { nome: 'Outro Nome' });
    await db.db.comEmpresa('default', async () => {
      // Registro que se edita não é registro. A permissão é SELECT e INSERT.
      await assert.rejects(db.db.run(`UPDATE logs SET resumo = 'nada aconteceu'`),
        /permiss|denied/i);
      await assert.rejects(db.db.run('DELETE FROM logs WHERE 1=1'), /permiss|denied/i);
    });
    await dona('PUT', '/api/clientes/c1', { nome: 'Cliente Um' });
  });
});
