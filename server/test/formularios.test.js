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
 * E é dado pessoal sensível pela LGPD — o que, em 2026-09-23, tirou a ficha do
 * site: **ela não é mais perguntada a quem agenda pela internet.** Quem
 * pergunta é a profissional, presencialmente, e grava por
 * `POST /api/agendamentos/:id/respostas`. Os três testes que este arquivo passou
 * a ter por causa disso são os que importam:
 *
 * - o site não consegue mais nem ler as perguntas, nem mandar respostas;
 * - agendar pelo site funciona mesmo com ficha obrigatória cadastrada;
 * - a profissional consegue responder depois, e só a de quem ela atende.
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

describe('o site não pergunta anamnese', () => {
  const agendarPeloSite = (extra = {}) => api.anonimo()('POST', '/api/publico/agendar', {
    nome: 'Cliente Nova', fone: '47944443333', nascimento: '1990-01-01',
    servicoId: 's1', profissionalId: 'p1', data: DIA, hora: '10:00', ...extra,
  });

  test('as perguntas não saem por rota pública nenhuma', async () => {
    // A rota existia e era inofensiva sozinha (devolvia pergunta, nunca
    // resposta) — mas existia só para alimentar uma coleta que não deve
    // acontecer no site. Saiu junto com o passo.
    //
    // 401 e não 404: sem rota no router público, o caminho cai no `exigeLogin`
    // que protege o resto de `/api`. O que importa é que não entrega — o
    // código exato é detalhe da ordem dos middlewares.
    await criarFicha();
    const r = await api.anonimo()('GET', '/api/publico/formularios/s1');
    assert.ok(r.status >= 400, `devolveu ${r.status}`);
    assert.ok(!JSON.stringify(r.corpo || '').includes('grávida'));
  });

  test('ficha obrigatória não impede agendar pelo site', async () => {
    // O ponto mais importante desta mudança: o servidor exigia a ficha em todo
    // agendamento. Tirar o passo sem tirar a exigência recusaria todo
    // agendamento online de um serviço com anamnese.
    await criarFicha();
    const r = await agendarPeloSite();
    assert.equal(r.status, 201);

    const fichas = await dona('GET', `/api/agendamentos/${r.corpo.agendamento.id}/respostas`);
    assert.deepEqual(fichas.corpo, [], 'nasce pendente, para a profissional preencher');
  });

  test('mandar respostas pelo site não grava nada', async () => {
    // Quem chamar a API direto, com o corpo antigo, não consegue escrever
    // dado de saúde por aqui — a origem decide, não o que o cliente enviou.
    const { corpo: f } = await criarFicha();
    const campos = Object.fromEntries(f.campos.map(c => [c.rotulo, c.id]));
    const r = await agendarPeloSite({
      respostas: { [f.id]: [{ campoId: campos['Está grávida?'], valor: true }] },
    });
    assert.equal(r.status, 201);

    const fichas = await dona('GET', `/api/agendamentos/${r.corpo.agendamento.id}/respostas`);
    assert.deepEqual(fichas.corpo, []);
  });
});

describe('a profissional responde no atendimento', () => {
  /** Um agendamento vindo do site, com a ficha ainda pendente. */
  async function pendente(prof = 'p1') {
    const { corpo: f } = await criarFicha();
    const r = await api.anonimo()('POST', '/api/publico/agendar', {
      nome: 'Cliente Nova', fone: '47944443333', nascimento: '1990-01-01',
      servicoId: 's1', profissionalId: prof, data: DIA, hora: '10:00',
    });
    return {
      form: f, agendamento: r.corpo.agendamento,
      campos: Object.fromEntries(f.campos.map(c => [c.rotulo, c.id])),
    };
  }

  test('grava a ficha depois, no agendamento que já existe', async () => {
    const { form, agendamento, campos } = await pendente();
    const r = await dona('POST', `/api/agendamentos/${agendamento.id}/respostas`, {
      respostas: { [form.id]: [
        { campoId: campos['Está grávida?'], valor: false },
        { campoId: campos['Tipo de pele'], valor: 'Mista' },
        { campoId: campos['Alergias'], valor: 'Nenhuma que eu saiba' },
      ] },
    });
    assert.equal(r.status, 201);
    assert.equal(r.corpo[0].formulario, 'Anamnese');
    // O rótulo vai congelado: é o prontuário do dia, não um ponteiro para a
    // pergunta viva.
    assert.deepEqual(r.corpo[0].respostas.map(x => x.rotulo),
      ['Está grávida?', 'Alergias', 'Tipo de pele']);
    assert.equal(r.corpo[0].respostas[0].valor, false);
  });

  test('pergunta obrigatória em branco é recusada', async () => {
    const { form, agendamento } = await pendente();
    const r = await dona('POST', `/api/agendamentos/${agendamento.id}/respostas`, {
      respostas: { [form.id]: [] },
    });
    assert.equal(r.status, 400);
    assert.match(r.corpo.erro, /responda/);
  });

  test('opção que não está na lista é recusada', async () => {
    const { form, agendamento, campos } = await pendente();
    const r = await dona('POST', `/api/agendamentos/${agendamento.id}/respostas`, {
      respostas: { [form.id]: [
        { campoId: campos['Está grávida?'], valor: false },
        { campoId: campos['Tipo de pele'], valor: 'Radioativa' },
      ] },
    });
    assert.equal(r.status, 400);
    assert.match(r.corpo.erro, /opção inválida/);
  });

  test('o rótulo gravado vem do banco, não do que o navegador mandou', async () => {
    // Sem isso, qualquer um escreveria a própria pergunta no prontuário alheio.
    const { form, agendamento, campos } = await pendente();
    const r = await dona('POST', `/api/agendamentos/${agendamento.id}/respostas`, {
      respostas: { [form.id]: [
        { campoId: campos['Está grávida?'], valor: true, rotulo: 'Quanto você ganha?' },
        { campoId: campos['Tipo de pele'], valor: 'Seca' },
      ] },
    });
    const rotulos = r.corpo[0].respostas.map(x => x.rotulo);
    assert.ok(!rotulos.includes('Quanto você ganha?'));
    assert.ok(rotulos.includes('Está grávida?'));
  });

  test('pergunta opcional em branco não vira linha no prontuário', async () => {
    const { form, agendamento, campos } = await pendente();
    const r = await dona('POST', `/api/agendamentos/${agendamento.id}/respostas`, {
      respostas: { [form.id]: [
        { campoId: campos['Está grávida?'], valor: false },
        { campoId: campos['Tipo de pele'], valor: 'Seca' },
      ] },
    });
    assert.equal(r.corpo[0].respostas.length, 2, 'sem "Alergias" em branco');
  });

  test('funcionário não responde a ficha de um atendimento que não é dele', async () => {
    // Mesma guarda da leitura: escrever no prontuário de quem não se atende
    // seria pior que ler.
    const { form, agendamento, campos } = await pendente('p2');   // Ana é a p1
    const r = await ana('POST', `/api/agendamentos/${agendamento.id}/respostas`, {
      respostas: { [form.id]: [
        { campoId: campos['Está grávida?'], valor: false },
        { campoId: campos['Tipo de pele'], valor: 'Seca' },
      ] },
    });
    assert.equal(r.status, 403);
  });

  test('sem login ninguém responde', async () => {
    const { agendamento } = await pendente();
    const r = await api.anonimo()('POST', `/api/agendamentos/${agendamento.id}/respostas`, {});
    assert.equal(r.status, 401);
  });

  test('responder de novo acrescenta, não reescreve', async () => {
    // Resposta dada é o que a cliente declarou naquele dia. Corrigir é
    // registrar a versão nova; as duas ficam, com a data de cada uma.
    const { form, agendamento, campos } = await pendente();
    const enviar = tipo => dona('POST', `/api/agendamentos/${agendamento.id}/respostas`, {
      respostas: { [form.id]: [
        { campoId: campos['Está grávida?'], valor: false },
        { campoId: campos['Tipo de pele'], valor: tipo },
      ] },
    });
    await enviar('Seca');
    const r = await enviar('Oleosa');
    assert.equal(r.corpo.length, 2, 'as duas ficam no histórico');
  });

  test('o balcão continua respondendo na hora de marcar', async () => {
    // O encaixe manual nunca deixou de perguntar: a mudança foi só no site.
    const { corpo: f } = await criarFicha();
    const campos = Object.fromEntries(f.campos.map(c => [c.rotulo, c.id]));
    const r = await dona('POST', '/api/agendamentos', {
      clienteId: 'c1', servicoId: 's1', profissionalId: 'p1', data: DIA, hora: '14:00',
      respostas: { [f.id]: [
        { campoId: campos['Está grávida?'], valor: false },
        { campoId: campos['Tipo de pele'], valor: 'Seca' },
      ] },
    });
    assert.equal(r.status, 201);
    const fichas = await dona('GET', `/api/agendamentos/${r.corpo.id}/respostas`);
    assert.equal(fichas.corpo.length, 1);
  });

  test('e o balcão ainda recusa agendamento com ficha em branco', async () => {
    await criarFicha();
    const r = await dona('POST', '/api/agendamentos', {
      clienteId: 'c1', servicoId: 's1', profissionalId: 'p1', data: DIA, hora: '15:00',
    });
    assert.equal(r.status, 400);
    assert.match(r.corpo.erro, /responda/);
  });
});

describe('a ficha é dado sensível', () => {
  /** Um atendimento da p2 com a ficha já respondida pelo balcão. */
  const responder = async () => {
    const { corpo: f } = await criarFicha();
    const campos = Object.fromEntries(f.campos.map(c => [c.rotulo, c.id]));
    const r = await dona('POST', '/api/agendamentos', {
      clienteId: 'c1', servicoId: 's1', profissionalId: 'p2', data: DIA, hora: '10:00',
      respostas: { [f.id]: [
        { campoId: campos['Está grávida?'], valor: true },
        { campoId: campos['Tipo de pele'], valor: 'Seca' },
      ] },
    });
    return { form: f, agendamento: r.corpo };
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

  test('nada de formulário sai por /api/publico', async () => {
    await responder();
    for (const caminho of ['/api/publico/formularios/s1', '/api/publico/formularios']) {
      const r = await api.anonimo()('GET', caminho);
      assert.ok(r.status >= 400, `${caminho} devolveu ${r.status}`);
      const texto = JSON.stringify(r.corpo || '');
      assert.ok(!texto.includes('grávida'), 'nem a pergunta');
      assert.ok(!texto.includes('Cliente'), 'muito menos a resposta');
    }
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

describe('o histórico de fichas da cliente', () => {
  /**
   * Duas fichas da mesma cliente, de atendimentos de profissionais
   * diferentes — é o que separa "a dona vê tudo" de "a funcionária vê o dela".
   */
  async function duasFichas() {
    const { corpo: f } = await criarFicha();
    const campos = Object.fromEntries(f.campos.map(c => [c.rotulo, c.id]));
    for (const [prof, hora, tipo] of [['p1', '09:00', 'Seca'], ['p2', '11:00', 'Oleosa']]) {
      await dona('POST', '/api/agendamentos', {
        clienteId: 'c1', servicoId: 's1', profissionalId: prof, data: DIA, hora,
        respostas: { [f.id]: [
          { campoId: campos['Está grávida?'], valor: false },
          { campoId: campos['Tipo de pele'], valor: tipo },
        ] },
      });
    }
    return f;
  }

  test('a dona vê todas, da mais recente para a mais antiga', async () => {
    await duasFichas();
    const r = await dona('GET', '/api/clientes/c1/fichas');
    assert.equal(r.status, 200);
    assert.equal(r.corpo.length, 2);
    // Sem o atendimento junto, ninguém sabe se está lendo a resposta de ontem
    // ou a de dois anos atrás.
    assert.equal(r.corpo[0].atendimento.data, DIA);
    assert.equal(r.corpo[0].atendimento.servico, 'Corte');
  });

  test('a funcionária vê só as dos atendimentos dela', async () => {
    // O recorte é da consulta, não da tela: o que ela não pode ver nem chega
    // a atravessar a rede.
    await duasFichas();
    const r = await ana('GET', '/api/clientes/c1/fichas');   // Ana é a p1
    assert.equal(r.status, 200);
    assert.equal(r.corpo.length, 1);
    assert.equal(r.corpo[0].respostas.find(x => x.rotulo === 'Tipo de pele').valor, 'Seca');
  });

  test('sem login ninguém lê', async () => {
    await duasFichas();
    assert.equal((await api.anonimo()('GET', '/api/clientes/c1/fichas')).status, 401);
  });

  test('cliente sem ficha devolve lista vazia, não erro', async () => {
    const r = await dona('GET', '/api/clientes/c1/fichas');
    assert.deepEqual(r.corpo, []);
  });

  test('abrir a ficha de saúde deixa rastro', async () => {
    // Leitura do painel não é registrada de propósito — o ruído afogaria a
    // lista útil. Esta é a exceção: abrir o histórico clínico de alguém é ato
    // deliberado, e a LGPD pede saber quem leu o quê.
    await duasFichas();
    await dona('GET', '/api/clientes/c1/fichas');

    const registro = await dona('GET', '/api/logs?acao=ficha.consultar');
    const linha = registro.corpo.find(l => l.acao === 'ficha.consultar');
    assert.ok(linha, 'o acesso tem de aparecer no registro');
    assert.match(linha.resumo, /ficha de sa[úu]de/i);
  });

  test('o registro guarda o acesso, não a resposta', async () => {
    // Copiar o conteúdo para o log seria espalhar o dado sensível numa segunda
    // tabela para "proteger" a primeira.
    await duasFichas();
    await dona('GET', '/api/clientes/c1/fichas');

    const registro = await dona('GET', '/api/logs?acao=ficha.consultar');
    const linha = registro.corpo.find(l => l.acao === 'ficha.consultar');
    const texto = JSON.stringify(linha);
    assert.ok(!texto.includes('Oleosa') && !texto.includes('grávida'),
      'nem a pergunta nem a resposta entram no registro');
  });

  test('a listagem de clientes não traz ficha nenhuma', async () => {
    // O buraco que esta rota separada existe para evitar: procurar um nome não
    // pode baixar a anamnese de todo mundo para o navegador.
    await duasFichas();
    const r = await dona('GET', '/api/clientes');
    const texto = JSON.stringify(r.corpo);
    assert.ok(!texto.includes('Oleosa'));
    assert.ok(!texto.includes('grávida'));
  });

  test('nem a ficha cadastral da cliente', async () => {
    await duasFichas();
    const r = await dona('GET', '/api/clientes/c1');
    const texto = JSON.stringify(r.corpo);
    assert.ok(!texto.includes('Oleosa'), 'o histórico clínico só sai quando é pedido');
  });
});

describe('não repetir o que já foi respondido', () => {
  test('a última resposta da cliente volta como sugestão', async () => {
    // Ficha de saúde não muda a cada visita, e obrigar a redigitar tudo faz a
    // pessoa responder qualquer coisa para se livrar.
    const { corpo: f } = await criarFicha();
    const campos = Object.fromEntries(f.campos.map(c => [c.rotulo, c.id]));
    await dona('POST', '/api/agendamentos', {
      clienteId: 'c1', servicoId: 's1', profissionalId: 'p1', data: DIA, hora: '10:00',
      respostas: { [f.id]: [
        { campoId: campos['Está grávida?'], valor: true },
        { campoId: campos['Tipo de pele'], valor: 'Oleosa' },
      ] },
    });

    await db.db.comEmpresa('default', async () => {
      const ultima = await forms.ultimaResposta('c1', f.id);
      assert.equal(ultima.find(x => x.rotulo === 'Tipo de pele').valor, 'Oleosa');
    });
  });
});
