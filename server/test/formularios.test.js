import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, limparAgenda, cenario, subirApi, criarEquipe, comoAdmin } from './ambiente.js';

/**
 * Formulários de intake: o que a empresa pergunta antes de atender.
 *
 * Anamnese de estética, ficha de saúde, preferências do pet. **A resposta é
 * histórico clínico, não cadastro** — fica presa ao atendimento, com o rótulo
 * congelado, porque a resposta muda com o tempo e a pergunta também. Guardar só
 * a mais recente apagaria a razão pela qual um procedimento foi feito de um
 * jeito.
 *
 * E é dado pessoal sensível pela LGPD. Quem lê é quem atende, e a rota recusa
 * o resto.
 */

const DIA = '2027-03-05';

let db, api, dona, ana, forms;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  forms = await import('../src/lib/formularios.js');
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
  await comoAdmin(`DELETE FROM form_answers WHERE tenant_id = 'default'`);
  await comoAdmin(`DELETE FROM form_services WHERE tenant_id = 'default'`);
  await comoAdmin(`DELETE FROM form_fields   WHERE tenant_id = 'default'`);
  await comoAdmin(`DELETE FROM forms         WHERE tenant_id = 'default'`);
  await comoAdmin(`DELETE FROM logs          WHERE tenant_id = 'default'`);
});

/** Uma anamnese curta, ligada ao serviço 's1'. */
const criarFicha = (extra = {}) => dona('POST', '/api/formularios', {
  nome: 'Anamnese', descricao: 'Antes de começar, algumas perguntas.',
  servicosIds: ['s1'],
  campos: [
    { rotulo: 'Está grávida?', tipo: 'sim_nao', obrigatorio: true },
    { rotulo: 'Alergias', tipo: 'longo', obrigatorio: false },
    { rotulo: 'Tipo de pele', tipo: 'escolha', obrigatorio: true, opcoes: ['Seca', 'Oleosa', 'Mista'] },
  ],
  ...extra,
});

describe('montar o formulário', () => {
  test('cria com as perguntas na ordem em que foram escritas', async () => {
    const r = await criarFicha();
    assert.equal(r.status, 201);
    assert.deepEqual(r.corpo.campos.map(c => c.rotulo),
      ['Está grávida?', 'Alergias', 'Tipo de pele']);
    assert.deepEqual(r.corpo.campos[2].opcoes, ['Seca', 'Oleosa', 'Mista']);
  });

  test('recusa pergunta sem enunciado e tipo desconhecido', async () => {
    assert.equal((await criarFicha({ campos: [{ rotulo: ' ', tipo: 'texto' }] })).status, 400);
    assert.equal((await criarFicha({ campos: [{ rotulo: 'Oi', tipo: 'assinatura' }] })).status, 400);
  });

  test('escolha sem opção nenhuma não é escolha', async () => {
    const r = await criarFicha({ campos: [{ rotulo: 'Tipo', tipo: 'escolha', opcoes: [] }] });
    assert.equal(r.status, 400);
    assert.match(r.corpo.erro, /ao menos uma opção/);
  });

  test('quem não cuida de cadastro não monta formulário', async () => {
    assert.equal((await ana('POST', '/api/formularios', { nome: 'X' })).status, 403);
  });

  test('arquivar não apaga — as respostas apontam para ele', async () => {
    const { corpo: f } = await criarFicha();
    assert.equal((await dona('DELETE', `/api/formularios/${f.id}`)).status, 200);
    const lista = await dona('GET', '/api/formularios');
    assert.equal(lista.corpo.find(x => x.id === f.id).ativo, false);
  });
});

describe('a cliente responde ao agendar', () => {
  const agendar = (respostas, extra = {}) => api.anonimo()('POST', '/api/publico/agendar', {
    nome: 'Cliente Nova', fone: '47944443333', nascimento: '1990-01-01',
    servicoId: 's1', profissionalId: 'p1', data: DIA, hora: '10:00',
    respostas, ...extra,
  });

  test('o site sabe o que perguntar antes de chegar lá', async () => {
    const { corpo: f } = await criarFicha();
    const r = await api.anonimo()('GET', '/api/publico/formularios/s1');
    assert.equal(r.corpo.length, 1);
    assert.equal(r.corpo[0].id, f.id);
    assert.equal(r.corpo[0].campos.length, 3);
  });

  test('serviço sem formulário não ganha passo nenhum', async () => {
    const r = await api.anonimo()('GET', '/api/publico/formularios/s1');
    assert.deepEqual(r.corpo, []);
  });

  test('grava a ficha junto do agendamento', async () => {
    const { corpo: f } = await criarFicha();
    const campos = Object.fromEntries(f.campos.map(c => [c.rotulo, c.id]));

    const r = await agendar({
      [f.id]: [
        { campoId: campos['Está grávida?'], valor: false },
        { campoId: campos['Tipo de pele'], valor: 'Mista' },
        { campoId: campos['Alergias'], valor: 'Nenhuma que eu saiba' },
      ],
    });
    assert.equal(r.status, 201);

    const fichas = await dona('GET', `/api/agendamentos/${r.corpo.agendamento.id}/respostas`);
    assert.equal(fichas.corpo.length, 1);
    assert.equal(fichas.corpo[0].formulario, 'Anamnese');
    // O rótulo vai congelado: é o prontuário do dia, não um ponteiro para a
    // pergunta viva.
    assert.deepEqual(fichas.corpo[0].respostas.map(x => x.rotulo),
      ['Está grávida?', 'Alergias', 'Tipo de pele']);
    assert.equal(fichas.corpo[0].respostas[0].valor, false);
  });

  test('pergunta obrigatória em branco recusa o agendamento inteiro', async () => {
    const { corpo: f } = await criarFicha();
    const r = await agendar({ [f.id]: [] });
    assert.equal(r.status, 400);
    assert.match(r.corpo.erro, /responda/);

    // E não deixa meio agendamento gravado: a conferência acontece antes da
    // transação, de propósito.
    await db.db.comEmpresa('default', async () => {
      const { n } = await db.db.get('SELECT COUNT(*) n FROM appointments');
      assert.equal(n, 0);
    });
  });

  test('opção que não está na lista é recusada', async () => {
    const { corpo: f } = await criarFicha();
    const campos = Object.fromEntries(f.campos.map(c => [c.rotulo, c.id]));
    const r = await agendar({
      [f.id]: [
        { campoId: campos['Está grávida?'], valor: false },
        { campoId: campos['Tipo de pele'], valor: 'Radioativa' },
      ],
    });
    assert.equal(r.status, 400);
    assert.match(r.corpo.erro, /opção inválida/);
  });

  test('o rótulo gravado vem do banco, não do que o cliente mandou', async () => {
    // Sem isso, qualquer um escreveria a própria pergunta no prontuário alheio.
    const { corpo: f } = await criarFicha();
    const campos = Object.fromEntries(f.campos.map(c => [c.rotulo, c.id]));
    const r = await agendar({
      [f.id]: [
        { campoId: campos['Está grávida?'], valor: true, rotulo: 'Quanto você ganha?' },
        { campoId: campos['Tipo de pele'], valor: 'Seca' },
      ],
    });
    const fichas = await dona('GET', `/api/agendamentos/${r.corpo.agendamento.id}/respostas`);
    const rotulos = fichas.corpo[0].respostas.map(x => x.rotulo);
    assert.ok(!rotulos.includes('Quanto você ganha?'));
    assert.ok(rotulos.includes('Está grávida?'));
  });

  test('pergunta opcional em branco não vira linha no prontuário', async () => {
    const { corpo: f } = await criarFicha();
    const campos = Object.fromEntries(f.campos.map(c => [c.rotulo, c.id]));
    const r = await agendar({
      [f.id]: [
        { campoId: campos['Está grávida?'], valor: false },
        { campoId: campos['Tipo de pele'], valor: 'Seca' },
      ],
    });
    const fichas = await dona('GET', `/api/agendamentos/${r.corpo.agendamento.id}/respostas`);
    assert.equal(fichas.corpo[0].respostas.length, 2, 'sem "Alergias" em branco');
  });
});

describe('a ficha é dado sensível', () => {
  const responder = async () => {
    const { corpo: f } = await criarFicha();
    const campos = Object.fromEntries(f.campos.map(c => [c.rotulo, c.id]));
    const r = await api.anonimo()('POST', '/api/publico/agendar', {
      nome: 'Cliente Nova', fone: '47944443333', nascimento: '1990-01-01',
      servicoId: 's1', profissionalId: 'p2', data: DIA, hora: '10:00',
      respostas: { [f.id]: [
        { campoId: campos['Está grávida?'], valor: true },
        { campoId: campos['Tipo de pele'], valor: 'Seca' },
      ] },
    });
    return { form: f, agendamento: r.corpo.agendamento };
  };

  test('funcionário não lê a ficha de um atendimento que não é dele', async () => {
    const { agendamento } = await responder();   // é da p2; Ana é a p1
    const r = await ana('GET', `/api/agendamentos/${agendamento.id}/respostas`);
    assert.equal(r.status, 403);
  });

  test('e a dona lê', async () => {
    const { agendamento } = await responder();
    const r = await dona('GET', `/api/agendamentos/${agendamento.id}/respostas`);
    assert.equal(r.status, 200);
    assert.equal(r.corpo[0].respostas[0].valor, true);
  });

  test('sem login ninguém lê ficha nenhuma', async () => {
    const { agendamento } = await responder();
    const r = await api.anonimo()('GET', `/api/agendamentos/${agendamento.id}/respostas`);
    assert.equal(r.status, 401);
  });

  test('a rota pública devolve a pergunta, nunca a resposta', async () => {
    await responder();
    const r = await api.anonimo()('GET', '/api/publico/formularios/s1');
    const texto = JSON.stringify(r.corpo);
    assert.ok(!texto.includes('Cliente Nova'));
    assert.ok(!/"valor"/.test(texto), 'só o que vai ser perguntado');
  });

  test('resposta dada não se edita', async () => {
    // É o registro do que a cliente declarou naquele dia. Corrigir é responder
    // de novo, não reescrever o passado.
    await responder();
    await db.db.comEmpresa('default', async () => {
      await assert.rejects(
        db.db.run(`UPDATE form_answers SET respostas = '[]'`), /permiss|denied/i
      );
    });
  });
});

describe('não repetir o que já foi respondido', () => {
  test('a última resposta da cliente volta como sugestão', async () => {
    // Ficha de saúde não muda a cada visita, e obrigar a redigitar tudo faz a
    // pessoa responder qualquer coisa para se livrar.
    const { corpo: f } = await criarFicha();
    const campos = Object.fromEntries(f.campos.map(c => [c.rotulo, c.id]));
    await api.anonimo()('POST', '/api/publico/agendar', {
      nome: 'Cliente Nova', fone: '47944443333', nascimento: '1990-01-01',
      servicoId: 's1', profissionalId: 'p1', data: DIA, hora: '10:00',
      respostas: { [f.id]: [
        { campoId: campos['Está grávida?'], valor: true },
        { campoId: campos['Tipo de pele'], valor: 'Oleosa' },
      ] },
    });

    await db.db.comEmpresa('default', async () => {
      const c = await db.db.get(`SELECT id FROM clients WHERE fone = '47944443333'`);
      const ultima = await forms.ultimaResposta(c.id, f.id);
      assert.equal(ultima.find(x => x.rotulo === 'Tipo de pele').valor, 'Oleosa');
    });
  });
});
