import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, subirApi, comoAdmin, SENHA } from './ambiente.js';

/**
 * Cadastro de empresa nova, sem passar por nós.
 *
 * É a porta de entrada do produto: se ela funcionar, a Vital deixa de precisar
 * criar cliente à mão. É também a única rota que roda sem empresa definida —
 * todas as outras precisam saber de quem é a requisição antes de tocar no
 * banco, e esta é a que decide isso.
 *
 * O que a empresa recebe ao nascer importa tanto quanto nascer: nada de ramo
 * nenhum. Serviço inventado por nós é serviço que ela vai ter de apagar antes
 * de cadastrar o dela — e, enquanto não apagar, está no ar para agendarem.
 */

let db, api, tenant;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  tenant = await import('../src/lib/tenant.js');
});

after(async () => {
  await api.fechar();
  await db.pool.end();
});

beforeEach(async () => {
  // Só as empresas criadas aqui; a empresa padrão fica, que é de onde os
  // outros arquivos partem.
  const criadas = await db.db.all(
    `SELECT id FROM plataforma.tenants WHERE id <> 'default' AND slug LIKE 'teste%'`
  );
  for (const { id } of criadas) {
    await db.db.comEmpresa(id, async () => {
      for (const t of ['messages', 'templates', 'users']) await db.db.run(`DELETE FROM ${t}`);
    });
    await db.db.run('DELETE FROM sessoes WHERE tenant_id = ?', id);
    // Pela conexão de administrador: a aplicação não pode apagar empresa.
    await comoAdmin('DELETE FROM plataforma.tenants WHERE id = $1', id);
  }
  tenant.esquecerCacheDeEmpresas();
});

const abrir = (extra = {}) => api.anonimo()('POST', '/api/cadastro', {
  nome: 'Teste Barbearia', ramo: 'barbearia', responsavel: 'João',
  email: 'joao@teste.com', senha: SENHA, ...extra,
});

describe('abrir uma empresa', () => {
  test('cria a empresa, o endereço e o dono numa tacada', async () => {
    const r = await abrir();
    assert.equal(r.status, 201);
    assert.equal(r.corpo.empresa.endereco, 'teste-barbearia');

    // O dono nasceu junto: empresa sem ninguém que entre não serve para nada,
    // e deixar isso para um segundo passo cria o intervalo em que outra pessoa
    // pode reivindicá-la.
    await db.db.comEmpresa(r.corpo.empresa.id, async () => {
      const dono = await db.db.get(`SELECT nome, papel FROM users`);
      assert.deepEqual(dono, { nome: 'João', papel: 'dono' });
    });
  });

  test('não abre sessão aqui, e diz para onde ir', async () => {
    // O cookie é preso ao host que o emitiu: sessão aberta no nosso endereço
    // não chegaria ao endereço da empresa. A resposta traz o destino.
    const r = await api.anonimo()('POST', '/api/cadastro', {
      nome: 'Teste Petshop', responsavel: 'Maria',
      email: 'maria@teste.com', senha: SENHA,
    });
    assert.equal(r.status, 201);
    assert.ok(r.corpo.painel);
  });

  test('a senha do cadastro já vale no endereço novo', async () => {
    await api.anonimo()('POST', '/api/cadastro', {
      nome: 'Teste Petshop', responsavel: 'Maria',
      email: 'maria@teste.com', senha: SENHA,
    });
    const dona = await api.entrar('maria@teste.com', SENHA, { host: 'teste-petshop.vital.app' });
    const eu = await dona('GET', '/api/auth/eu');
    assert.equal(eu.corpo.usuario.papel, 'dono');
  });

  test('e essa senha não abre o painel de outra empresa', async () => {
    await api.anonimo()('POST', '/api/cadastro', {
      nome: 'Teste Petshop', responsavel: 'Maria',
      email: 'maria@teste.com', senha: SENHA,
    });
    const r = await api.anonimo({ host: 'localhost' })('POST', '/api/auth/login',
      { email: 'maria@teste.com', senha: SENHA });
    assert.equal(r.status, 401, 'o usuário é da empresa dela, não da empresa padrão');
  });

  test('o endereço novo já responde, sem esperar o cache vencer', async () => {
    // O caso real: a pessoa espia o endereço antes de cadastrar. A resposta é
    // 404, e o 404 fica guardado — a resolução de host tem cache de um minuto.
    // Sem esquecer o cache ao criar, o próprio site dela responderia "não
    // existe uma agenda neste endereço" pelo primeiro minuto de vida.
    const espiada = await api.noHost('teste-barbearia.vital.app')('GET', '/api/publico/vitrine');
    assert.equal(espiada.status, 404, 'antes de existir, não existe mesmo');

    await abrir();

    const v = await api.noHost('teste-barbearia.vital.app')('GET', '/api/publico/vitrine');
    assert.equal(v.status, 200);
    assert.equal(v.corpo.negocio.nome, 'Teste Barbearia');
  });

  test('nasce sem serviço nenhum de ramo nenhum', async () => {
    await abrir();
    const v = (await api.noHost('teste-barbearia.vital.app')('GET', '/api/publico/vitrine')).corpo;
    assert.deepEqual(v.servicos, [], 'catálogo de outra pessoa não entra sozinho');
    assert.deepEqual(v.profissionais, []);
  });

  test('mas nasce com os textos de WhatsApp prontos', async () => {
    const r = await abrir();
    await db.db.comEmpresa(r.corpo.empresa.id, async () => {
      const { n } = await db.db.get('SELECT COUNT(*) n FROM templates');
      assert.ok(n >= 8, 'a empresa começa com os textos, para não escrever do zero');
      const t = await db.db.get(`SELECT texto FROM templates WHERE chave = 'confirmacao'`);
      assert.ok(t.texto.includes('{empresa}'));
      assert.ok(!/💅|linda|esmalte/i.test(t.texto), 'texto neutro, não de estética');
    });
  });

  test('o dado da empresa nova não aparece na empresa de sempre', async () => {
    const r = await abrir();
    await db.db.comEmpresa('default', async () => {
      const achou = await db.db.get('SELECT id FROM users WHERE email = ?', 'joao@teste.com');
      assert.equal(achou, undefined);
    });
    assert.ok(r.corpo.empresa.id !== 'default');
  });
});

describe('endereço', () => {
  test('sai do nome, sem acento nem espaço', async () => {
    const r = await api.anonimo()('GET', '/api/cadastro/endereco-livre?nome=' + encodeURIComponent('Ateliê São João'));
    assert.equal(r.corpo.slug, 'atelie-sao-joao');
    assert.equal(r.corpo.livre, true);
  });

  test('nome repetido não derruba o cadastro: ganha sufixo', async () => {
    await abrir();
    const segunda = await abrir({ email: 'outro@teste.com' });
    assert.equal(segunda.status, 201);
    assert.equal(segunda.corpo.empresa.endereco, 'teste-barbearia-2',
      'duas barbearias com o mesmo nome existem, e as duas precisam entrar');
  });

  test('avisa que o endereço está tomado antes de enviar', async () => {
    await abrir();
    const r = await api.anonimo()('GET', '/api/cadastro/endereco-livre?nome=Teste%20Barbearia');
    assert.equal(r.corpo.livre, false);
  });
});

describe('o que o cadastro recusa', () => {
  const casos = [
    ['sem nome do negócio', { nome: '' }],
    ['sem e-mail', { email: '' }],
    ['e-mail sem arroba', { email: 'joao' }],
    ['senha curta', { senha: '1234' }],
    ['sem nome do responsável', { responsavel: '' }],
  ];
  for (const [caso, patch] of casos) {
    test(caso, async () => {
      const r = await abrir(patch);
      assert.equal(r.status, 400, caso);
    });
  }

  test('e não deixa empresa órfã quando recusa', async () => {
    await abrir({ senha: '123' });
    const sobrou = await db.db.get(
      `SELECT id FROM plataforma.tenants WHERE slug LIKE 'teste-barbearia%'`
    );
    assert.equal(sobrou, undefined, 'empresa criada e cadastro recusado deixaria lixo');
  });
});
