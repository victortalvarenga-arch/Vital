import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, cenario, subirApi, criarEmpresa, comoAdmin, SENHA } from './ambiente.js';

/**
 * Suporte: a empresa fala com a Vital de dentro do produto.
 *
 * **O que este arquivo existe para provar é o isolamento.** `plataforma.tickets`
 * não tem Row-Level Security — precisa não ter, porque quem lê a fila é a nossa
 * equipe atravessando todas as empresas. O preço é que errar o filtro numa
 * consulta não dá erro: devolve o chamado da empresa errada, calado.
 *
 * Então aqui se testa com DUAS empresas de verdade, e o que importa é a
 * segunda não enxergar nada da primeira — nem pela listagem, nem mandando o id
 * da outra no corpo.
 */

const B = 'empresa-b';

let db, api, donaA, donaB, vital;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();

  await criarEmpresa(db, { id: B, slug: 'bia', nome: 'Salão da Bia' });
  await db.db.run(`UPDATE plataforma.tenants SET slug = 'lume' WHERE id = 'default'`);

  for (const [empresa, prefixo] of [['default', 'a-'], [B, 'b-']]) {
    await db.db.comEmpresa(empresa, async () => {
      await limpar(db);
      await cenario(db, { prefixo });
    });
  }
});

after(async () => {
  await api.fechar();
  await db.pool.end();
});

beforeEach(async () => {
  await comoAdmin('DELETE FROM plataforma.tickets');
  await comoAdmin('DELETE FROM plataforma.sessoes');
  await comoAdmin('DELETE FROM plataforma.auditoria');
  await comoAdmin('DELETE FROM plataforma.usuarios');
  await comoAdmin('DELETE FROM users');

  // Uma dona em cada empresa, cada uma pelo próprio endereço.
  const criar = async (host, email) => {
    const c = api.noHost(host);
    const r = await c('POST', '/api/auth/primeiro-acesso', { nome: 'Dona', email, senha: SENHA });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    return c;
  };
  donaA = await criar('lume.vital.app', 'dona@a.com');
  donaB = await criar('bia.vital.app', 'dona@b.com');

  const admin = api.anonimo();
  const r = await admin('POST', '/api/plataforma/primeiro-acesso',
    { nome: 'Victor', email: 'victor@vital.com', senha: SENHA });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  vital = admin;
});

describe('abrir um chamado', () => {
  test('grava com a empresa da conexão e o autor da sessão', async () => {
    const r = await donaA('POST', '/api/suporte', {
      assunto: 'A agenda não abre',
      mensagem: 'Clico em Calendário e a tela fica branca desde ontem.',
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.status, 'aberto');
    assert.equal(r.corpo.autor, 'Dona', 'o autor vem da sessão, não do corpo');

    const { rows } = await comoAdmin('SELECT * FROM plataforma.tickets');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].tenant_id, 'default');
  });

  test('assunto vazio e mensagem curta demais são recusados', async () => {
    const semAssunto = await donaA('POST', '/api/suporte',
      { assunto: '', mensagem: 'texto suficiente aqui' });
    assert.equal(semAssunto.status, 400);
    const curta = await donaA('POST', '/api/suporte', { assunto: 'Erro', mensagem: 'oi' });
    assert.equal(curta.status, 400, 'chamado sem conteúdo não ajuda ninguém');
  });

  test('a abertura fica no registro da empresa', async () => {
    const r = await donaA('POST', '/api/suporte', {
      assunto: 'Dúvida', mensagem: 'Como faço para mudar o preço de um serviço?',
    });
    const { corpo } = await donaA('GET', `/api/logs?alvoId=${r.corpo.id}`);
    assert.ok(corpo.some(l => l.acao === 'suporte.aberto'));
  });
});

describe('isolamento entre empresas', () => {
  // Sem RLS nesta tabela, é o código que segura. Se o filtro por
  // `empresaAtual()` sair de qualquer consulta, é aqui que aparece.
  test('a empresa vê os próprios chamados e nenhum outro', async () => {
    await donaA('POST', '/api/suporte', { assunto: 'Da empresa A', mensagem: 'mensagem da empresa A' });
    await donaB('POST', '/api/suporte', { assunto: 'Da empresa B', mensagem: 'mensagem da empresa B' });

    const listaA = await donaA('GET', '/api/suporte');
    const listaB = await donaB('GET', '/api/suporte');

    assert.deepEqual(listaA.corpo.map(t => t.assunto), ['Da empresa A']);
    assert.deepEqual(listaB.corpo.map(t => t.assunto), ['Da empresa B']);
  });

  test('mandar a empresa alheia no corpo não muda de dono', async () => {
    // A tentativa óbvia de quem quer escrever na conta da outra.
    await donaB('POST', '/api/suporte', {
      assunto: 'Tentando', mensagem: 'mensagem plantada na empresa alheia',
      tenantId: 'default', tenant_id: 'default', empresaId: 'default',
    });
    const listaA = await donaA('GET', '/api/suporte');
    assert.equal(listaA.corpo.length, 0, 'nada pode ter caído na empresa A');

    const { rows } = await comoAdmin('SELECT tenant_id FROM plataforma.tickets');
    assert.equal(rows[0].tenant_id, B);
  });
});

describe('a fila da Vital', () => {
  test('a nossa equipe vê o chamado das duas, com o nome da empresa', async () => {
    await donaA('POST', '/api/suporte', { assunto: 'Da empresa A', mensagem: 'mensagem da empresa A' });
    await donaB('POST', '/api/suporte', { assunto: 'Da empresa B', mensagem: 'mensagem da empresa B' });

    const { corpo } = await vital('GET', '/api/plataforma/tickets');
    assert.equal(corpo.length, 2);
    assert.ok(corpo.every(t => t.empresa), 'a fila precisa dizer de quem é cada um');
    assert.deepEqual(
      corpo.map(t => `${t.empresa}: ${t.assunto}`).sort(),
      ['Meu negócio: Da empresa A', 'Salão da Bia: Da empresa B']
    );
  });

  test('a sessão do painel não abre a fila da Vital', async () => {
    const r = await donaA('GET', '/api/plataforma/tickets');
    assert.equal(r.status, 401, 'são duas identidades, não uma com dois poderes');
  });

  test('responder marca como respondido e volta para a empresa', async () => {
    const novo = await donaA('POST', '/api/suporte', {
      assunto: 'A agenda não abre', mensagem: 'a tela fica branca desde ontem',
    });
    const r = await vital('PATCH', `/api/plataforma/tickets/${novo.corpo.id}`, {
      resposta: 'Era o bloqueador de anúncio. Já corrigimos.',
    });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.status, 'respondido', 'escrever resposta tira da fila de abertos');

    const { corpo } = await donaA('GET', '/api/suporte');
    assert.equal(corpo[0].resposta, 'Era o bloqueador de anúncio. Já corrigimos.');
    assert.equal(corpo[0].status, 'respondido');
  });

  test('a empresa não responde o próprio chamado', async () => {
    const novo = await donaA('POST', '/api/suporte', {
      assunto: 'Teste', mensagem: 'mensagem de teste com tamanho suficiente',
    });
    const r = await donaA('PATCH', `/api/plataforma/tickets/${novo.corpo.id}`, { resposta: 'eu mesma' });
    assert.equal(r.status, 401);
  });

  test('a fila de abertos esconde o que já foi fechado', async () => {
    const um = await donaA('POST', '/api/suporte', { assunto: 'Um', mensagem: 'mensagem do primeiro' });
    await donaA('POST', '/api/suporte', { assunto: 'Dois', mensagem: 'mensagem do segundo' });
    await vital('PATCH', `/api/plataforma/tickets/${um.corpo.id}`, { status: 'fechado' });

    const { corpo } = await vital('GET', '/api/plataforma/tickets?status=abertos');
    assert.deepEqual(corpo.map(t => t.assunto), ['Dois']);
  });
});
