import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, cenario, agendar, subirApi, criarEmpresa, comoAdmin, SENHA } from './ambiente.js';

/**
 * Back-office da Vital.
 *
 * Duas coisas precisam ser verdade ao mesmo tempo, e elas puxam em direções
 * opostas: a nossa equipe tem de enxergar todas as empresas, e não pode
 * enxergar o dado de nenhuma.
 *
 * A saída foi `plataforma.numeros_por_empresa()`, que roda com os poderes do
 * dono do banco e por isso ignora o RLS — e devolve **só contagens**. Não há
 * coluna que carregue nome de cliente. Estes testes existem para que isso
 * continue verdade quando alguém acrescentar um campo "útil" ali.
 *
 * E a identidade da nossa equipe é outra: quem dá suporte não é dono de empresa
 * nenhuma, e o dono de uma empresa não administra a plataforma. Tabelas
 * separadas, cookies de nomes diferentes.
 */

const B = 'empresa-b';
const DIA = '2027-03-05';

let db, api, eu;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();

  await criarEmpresa(db, { id: B, slug: 'bia', nome: 'Salão da Bia' });
  await db.db.run(`UPDATE plataforma.tenants SET slug = 'lume' WHERE id = 'default'`);

  for (const [empresa, prefixo] of [['default', 'a-'], [B, 'b-']]) {
    await db.db.comEmpresa(empresa, async () => {
      await limpar(db);
      await cenario(db, { prefixo });
      await db.db.run(`UPDATE clients SET nome = 'Cliente Secreta' WHERE id = ?`, prefixo + 'c1');
      await agendar(db, { prof: prefixo + 'p1', data: DIA, hora: '10:00' });
    });
  }
});

after(async () => {
  await api.fechar();
  await db.pool.end();
});

beforeEach(async () => {
  await comoAdmin('DELETE FROM plataforma.sessoes');
  await comoAdmin('DELETE FROM plataforma.auditoria');
  await comoAdmin('DELETE FROM plataforma.usuarios');
  await comoAdmin(`UPDATE plataforma.tenants SET status = 'ativa', ativo = 1, plano = 'gratuito'`);

  const admin = api.anonimo();
  const r = await admin('POST', '/api/plataforma/primeiro-acesso',
    { nome: 'Victor', email: 'victor@vital.com', senha: SENHA });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  eu = admin;
});

describe('entrar na plataforma', () => {
  test('o primeiro acesso se fecha depois do primeiro', async () => {
    const r = await api.anonimo()('POST', '/api/plataforma/primeiro-acesso',
      { nome: 'Outro', email: 'outro@vital.com', senha: SENHA });
    assert.equal(r.status, 409);
  });

  test('sem sessão não passa', async () => {
    for (const caminho of ['/api/plataforma/empresas', '/api/plataforma/resumo', '/api/plataforma/eu']) {
      assert.equal((await api.anonimo()('GET', caminho)).status, 401, caminho);
    }
  });

  test('senha errada e e-mail inexistente dão a mesma resposta', async () => {
    const a = await api.anonimo()('POST', '/api/plataforma/login', { email: 'victor@vital.com', senha: 'errada12345' });
    const b = await api.anonimo()('POST', '/api/plataforma/login', { email: 'ninguem@vital.com', senha: 'errada12345' });
    assert.equal(a.status, 401);
    assert.deepEqual(a.corpo, b.corpo, 'a resposta não pode dizer quais e-mails existem');
  });

  test('o cookie da plataforma não abre o painel de nenhuma empresa', async () => {
    // São dois espaços de identidade, e cruzá-los transformaria suporte em dono.
    const r = await eu('GET', '/api/estado');
    assert.equal(r.status, 401);
  });

  test('e o cookie de uma empresa não abre a plataforma', async () => {
    const dona = api.anonimo();
    await dona('POST', '/api/auth/primeiro-acesso',
      { nome: 'Dona', email: 'dona@teste.com', senha: SENHA });
    assert.equal((await dona('GET', '/api/plataforma/empresas')).status, 401);
  });

  test('as duas sessões convivem no mesmo navegador', async () => {
    // O que separa as identidades são as tabelas: um token de uma nunca é
    // encontrado na outra. O nome diferente do cookie compra outra coisa —
    // que as duas caibam ao mesmo tempo. Com o mesmo nome, entrar na
    // plataforma derrubaria silenciosamente quem estivesse no painel, e é o
    // caso normal de quem desenvolve ou dá suporte.
    const nav = api.anonimo();
    // `primeiro-acesso` se fecha depois do primeiro; entrar cobre as duas
    // ordens em que este arquivo pode rodar.
    const criou = await nav('POST', '/api/auth/primeiro-acesso',
      { nome: 'Dona', email: 'dona@teste.com', senha: SENHA });
    if (criou.status !== 201) {
      const entrou = await nav('POST', '/api/auth/login', { email: 'dona@teste.com', senha: SENHA });
      assert.equal(entrou.status, 200, JSON.stringify(entrou.corpo));
    }
    await nav('POST', '/api/plataforma/login', { email: 'victor@vital.com', senha: SENHA });

    assert.equal((await nav('GET', '/api/plataforma/eu')).status, 200, 'plataforma segue aberta');
    assert.equal((await nav('GET', '/api/auth/eu')).status, 200, 'e o painel também');
  });
});

describe('a lista de empresas', () => {
  test('mostra todas, com plano, status e desde quando', async () => {
    const { corpo } = await eu('GET', '/api/plataforma/empresas');
    assert.equal(corpo.length, 2);
    const bia = corpo.find(e => e.slug === 'bia');
    assert.equal(bia.nome, 'Salão da Bia');
    assert.equal(bia.plano, 'gratuito');
    assert.equal(bia.status, 'ativa');
    assert.ok(bia.desde);
  });

  test('traz os números de cada uma, contados por dentro do RLS', async () => {
    const { corpo } = await eu('GET', '/api/plataforma/empresas');
    for (const e of corpo) {
      assert.equal(e.clientes, 1, e.nome);
      assert.equal(e.profissionais, 2, e.nome);
      assert.equal(e.servicos, 1, e.nome);
      assert.ok(e.ultimoMovimento, 'já teve agendamento');
    }
  });

  test('NÃO devolve dado de cliente de ninguém', async () => {
    // A função que conta roda ignorando o RLS. Ela devolver contagem é o
    // acordo; devolver linha seria furar o isolamento por dentro do
    // back-office, que é justamente onde ninguém iria procurar.
    const resposta = JSON.stringify((await eu('GET', '/api/plataforma/empresas')).corpo);
    assert.ok(!resposta.includes('Cliente Secreta'), 'nome de cliente vazou na lista de empresas');
    assert.ok(!resposta.includes('47900000001'), 'telefone de cliente vazou');
  });

  test('a própria função de contagem só tem colunas de contagem', async () => {
    // Vale contra o campo "útil" que alguém acrescenta depois.
    const colunas = await db.db.all(`
      SELECT p.proname, pg_get_function_result(p.oid) AS retorno
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'plataforma' AND p.proname = 'numeros_por_empresa'
    `);
    const retorno = colunas[0].retorno;
    assert.ok(!/nome|fone|email|telefone/i.test(retorno),
      `a função passou a devolver dado pessoal: ${retorno}`);
  });
});

describe('os totais da plataforma', () => {
  test('conta empresas, clientes finais e agendamentos do mês', async () => {
    const { corpo } = await eu('GET', '/api/plataforma/resumo');
    assert.equal(corpo.empresas.total, 2);
    assert.equal(corpo.empresas.ativas, 2);
    assert.equal(corpo.clientesFinais, 2, 'uma cliente em cada empresa');
    assert.deepEqual(corpo.porPlano, [{ plano: 'gratuito', empresas: 2 }]);
  });

  test('marca quem nunca teve agendamento', async () => {
    // É o número que diz se o produto pegou: empresa que se cadastrou e nunca
    // usou cancela antes de virar cliente de verdade.
    await criarEmpresa(db, { id: 'empresa-c', slug: 'nova', nome: 'Recém-chegada' });
    const { corpo } = await eu('GET', '/api/plataforma/resumo');
    assert.equal(corpo.semNenhumAgendamento, 1);
    await comoAdmin(`DELETE FROM plataforma.tenants WHERE id = 'empresa-c'`);
  });
});

describe('suspender uma empresa', () => {
  test('derruba o site dela na hora, sem esperar cache', async () => {
    assert.equal((await api.noHost('bia.vital.app')('GET', '/api/publico/vitrine')).status, 200);

    const r = await eu('POST', `/api/plataforma/empresas/${B}/status`,
      { status: 'suspensa', motivo: 'inadimplência' });
    assert.equal(r.status, 200);

    assert.equal((await api.noHost('bia.vital.app')('GET', '/api/publico/vitrine')).status, 403);
  });

  test('e não encosta na empresa do lado', async () => {
    await eu('POST', `/api/plataforma/empresas/${B}/status`, { status: 'suspensa' });
    assert.equal((await api.noHost('lume.vital.app')('GET', '/api/publico/vitrine')).status, 200);
  });

  test('reativar traz de volta — nada foi apagado', async () => {
    await eu('POST', `/api/plataforma/empresas/${B}/status`, { status: 'suspensa' });
    await eu('POST', `/api/plataforma/empresas/${B}/status`, { status: 'ativa' });

    const v = await api.noHost('bia.vital.app')('GET', '/api/publico/vitrine');
    assert.equal(v.status, 200);
    assert.equal(v.corpo.servicos.length, 1, 'o catálogo dela continua lá');
  });

  test('suporte não suspende ninguém', async () => {
    await comoAdmin(
      `INSERT INTO plataforma.usuarios (id, nome, email, senha_hash, papel, ativo, criado_em)
       SELECT 'sup1', 'Suporte', 'suporte@vital.com', senha_hash, 'suporte', 1, criado_em
         FROM plataforma.usuarios WHERE email = 'victor@vital.com'`
    );
    // Login da plataforma é rota própria — `api.entrar` é a do painel da empresa.
    const s = api.anonimo();
    const entrou = await s('POST', '/api/plataforma/login',
      { email: 'suporte@vital.com', senha: SENHA });
    assert.equal(entrou.status, 200);
    assert.equal(entrou.corpo.poderes.suspender, false);

    assert.equal((await s('GET', '/api/plataforma/empresas')).status, 200, 'suporte enxerga');
    const r = await s('POST', `/api/plataforma/empresas/${B}/status`, { status: 'suspensa' });
    assert.equal(r.status, 403, 'mas não mexe no contrato');
  });
});

describe('o rastro do que fizemos', () => {
  test('suspender fica registrado, com quem e por quê', async () => {
    await eu('POST', `/api/plataforma/empresas/${B}/status`,
      { status: 'suspensa', motivo: 'inadimplência' });

    const { corpo } = await eu('GET', `/api/plataforma/auditoria?empresaId=${B}`);
    const linha = corpo.find(l => l.acao === 'status_suspensa');
    assert.ok(linha, 'ação sem registro é ação que não aconteceu');
    assert.equal(linha.usuario, 'Victor');
    assert.equal(linha.empresa, 'Salão da Bia');
    assert.equal(linha.detalhe.motivo, 'inadimplência');
    assert.equal(linha.detalhe.de, 'ativa');
  });

  test('mudar o plano também', async () => {
    await eu('PATCH', `/api/plataforma/empresas/${B}/plano`, { plano: 'profissional' });
    const { corpo } = await eu('GET', '/api/plataforma/auditoria');
    const linha = corpo.find(l => l.acao === 'plano');
    assert.equal(linha.detalhe.para, 'profissional');
  });
});
