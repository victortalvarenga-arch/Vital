import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, cenario, agendar, subirApi, criarEmpresa, SENHA } from './ambiente.js';

/**
 * Isolamento entre empresas.
 *
 * É a garantia que sustenta o produto inteiro: um banco só, várias empresas
 * dentro dele, e nenhuma enxergando a da outra. Quebrar isso não derruba nada e
 * não aparece em tela nenhuma — só entrega o dado errado para quem pediu.
 *
 * O isolamento vive no banco (Row-Level Security), e não em `WHERE tenant_id`
 * espalhado pelas consultas, justamente porque esquecer o filtro uma vez basta.
 * Estes testes existem para provar que ele continua ligado: consulta sem filtro
 * nenhum, pedindo pelo id exato da linha da outra empresa, tem de voltar vazia.
 *
 * Foi provado uma vez com teste descartável, no Bloco 2, e o teste se perdeu.
 * Aqui fica.
 */

const A = 'default';                  // a empresa de sempre
const B = 'empresa-b';
const DIA = '2027-03-05';

let db, api, tenant;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  tenant = await import('../src/lib/tenant.js');

  await criarEmpresa(db, { id: B, slug: 'bia', nome: 'Salão da Bia', dominio: 'agenda.salaodabia.com.br' });
  await db.db.run(
    `UPDATE plataforma.tenants SET slug = 'lume', dominio = 'agenda.estudiolume.com.br' WHERE id = ?`, A
  );

  // Cada empresa com o seu, e com ids diferentes — a chave primária é global.
  // O nome vai depois de `limpar`, que zera a config junto com o resto.
  for (const [empresa, nome] of [[A, 'Estúdio Lume'], [B, 'Salão da Bia']]) {
    await db.db.comEmpresa(empresa, async () => {
      await limpar(db);
      await cenario(db, { prefixo: empresa + '-' });
      await db.setConfig({ nome });
      await db.db.run(`UPDATE staff SET nome = ? WHERE id = ?`, `Ana da ${empresa}`, empresa + '-p1');
      await db.db.run(`UPDATE clients SET nome = ? WHERE id = ?`, `Cliente da ${empresa}`, empresa + '-c1');
      await agendar(db, { prof: empresa + '-p1', data: DIA, hora: '10:00' });
    });
  }
  tenant.esquecerCacheDeEmpresas();
});

after(async () => {
  await api.fechar();
  await db.pool.end();
});

const na = (empresa, fn) => db.db.comEmpresa(empresa, fn);

describe('o banco recusa sozinho', () => {
  test('consulta sem filtro nenhum devolve só a empresa da conexão', async () => {
    for (const [empresa, esperado] of [[A, 'Ana da default'], [B, 'Ana da empresa-b']]) {
      await na(empresa, async () => {
        const linhas = await db.db.all('SELECT nome FROM staff ORDER BY nome');
        assert.equal(linhas.length, 2, `${empresa} deveria ver só as duas dela`);
        assert.ok(linhas.some(l => l.nome === esperado));
      });
    }
  });

  test('pedir pelo id exato da linha da outra volta vazio', async () => {
    // É o ataque real: alguém descobre um id — eles circulam em link e em URL —
    // e pergunta direto por ele. Sem RLS, viria a linha da outra empresa.
    await na(A, async () => {
      assert.equal(await db.db.get(`SELECT nome FROM clients WHERE id = ?`, B + '-c1'), undefined);
      assert.equal(await db.db.get(`SELECT nome FROM staff WHERE id = ?`, B + '-p1'), undefined);
      const meu = await db.db.get(`SELECT nome FROM clients WHERE id = ?`, A + '-c1');
      assert.equal(meu.nome, 'Cliente da default');
    });
    await na(B, async () => {
      assert.equal(await db.db.get(`SELECT nome FROM clients WHERE id = ?`, A + '-c1'), undefined);
    });
  });

  test('toda tabela de negócio tem a política ligada, inclusive as futuras', async () => {
    // Os testes acima provam as tabelas que alguém lembrou de listar. Este pega
    // a regressão real: tabela nova criada numa migration sem a política junto.
    // Ela nasceria aberta e nada falharia até uma empresa ler o dado de outra.
    //
    // FORCE importa tanto quanto ENABLE: sem ele, o dono da tabela — que é quem
    // roda as migrations — continua ignorando o RLS.
    const sem = await db.db.all(`
      SELECT relname FROM pg_class
       WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
         AND relname NOT IN ('schema_migrations', 'settings', 'sessoes')
         AND NOT (relrowsecurity AND relforcerowsecurity)
       ORDER BY relname
    `);
    assert.deepEqual(sem.map(r => r.relname), [],
      'estas tabelas estão sem Row-Level Security ligado e forçado');
  });

  test('e cada uma tem política de leitura e de escrita', async () => {
    // Política só com USING filtra o que se lê e deixa gravar no nome de
    // terceiros. As duas metades precisam existir.
    const frouxas = await db.db.all(`
      SELECT c.relname FROM pg_class c
        JOIN pg_policy p ON p.polrelid = c.oid
       WHERE c.relnamespace = 'public'::regnamespace
         AND (p.polqual IS NULL OR p.polwithcheck IS NULL)
       ORDER BY c.relname
    `);
    assert.deepEqual(frouxas.map(r => r.relname), []);
  });

  test('escrever não deixa marcar a linha como sendo de outra empresa', async () => {
    await na(A, async () => {
      // O WITH CHECK da política impede gravar no nome de terceiros — sem ele
      // daria para inserir dado numa empresa mesmo sem conseguir lê-lo.
      await assert.rejects(
        db.db.run(
          `INSERT INTO clients (id, tenant_id, nome, fone, criado_em)
           VALUES ('intruso', ?, 'Plantado', '47999999999', '2026-01-01')`, B
        ),
        /row-level security|linha|policy|política/i
      );
    });
    await na(B, async () => {
      const achou = await db.db.get(`SELECT id FROM clients WHERE id = 'intruso'`);
      assert.equal(achou, undefined, 'nada foi plantado na empresa B');
    });
  });

  test('UPDATE não alcança a linha da outra empresa', async () => {
    await na(A, () => db.db.run(`UPDATE clients SET nome = 'Renomeada por A' WHERE id LIKE '%c1'`));
    await na(B, async () => {
      const c = await db.db.get(`SELECT nome FROM clients WHERE id = ?`, B + '-c1');
      assert.equal(c.nome, 'Cliente da empresa-b', 'a de B ficou intacta');
    });
    await na(A, () => db.db.run(`UPDATE clients SET nome = 'Cliente da default' WHERE id = ?`, A + '-c1'));
  });

  test('DELETE também não', async () => {
    await na(A, () => db.db.run('DELETE FROM appointments'));
    await na(B, async () => {
      const { n } = await db.db.get('SELECT COUNT(*) n FROM appointments');
      assert.equal(n, 1, 'o agendamento de B continua lá');
    });
    await na(A, () => agendar(db, { prof: A + '-p1', data: DIA, hora: '10:00' }));
  });
});

describe('o endereço decide de quem é a requisição', () => {
  test('subdomínio e domínio próprio levam à empresa certa', async () => {
    const vitrine = async host => (await api.noHost(host)('GET', '/api/publico/vitrine')).corpo;
    assert.equal((await vitrine('bia.vital.app')).negocio.nome, 'Salão da Bia');
    assert.equal((await vitrine('agenda.salaodabia.com.br')).negocio.nome, 'Salão da Bia');
    // A mesma rota, outro endereço, outra empresa: é o produto inteiro num teste.
    assert.equal((await vitrine('lume.vital.app')).negocio.nome, 'Estúdio Lume');
  });

  test('cada empresa recebe o próprio catálogo, não uma lista vazia', async () => {
    // As consultas de catálogo traziam `WHERE tenant_id = 'default'` escrito à
    // mão. O RLS já recortava para a empresa certa e o filtro recortava de novo
    // para a errada: a segunda empresa via zero serviços, sem erro nenhum.
    for (const [host, esperado] of [['lume.vital.app', A], ['bia.vital.app', B]]) {
      const v = (await api.noHost(host)('GET', '/api/publico/vitrine')).corpo;
      assert.equal(v.servicos.length, 1, `${host} deveria ver o serviço dela`);
      assert.equal(v.servicos[0].id, esperado + '-s1');
      assert.equal(v.profissionais.length, 2);
      assert.ok(v.profissionais.every(p => p.id.startsWith(esperado + '-')));
    }
  });

  test('a config de uma empresa não sobrescreve a da outra', async () => {
    // `PUT /api/config` chamava `setConfig(body)` sem empresa, e o padrão era a
    // empresa 'default': salvar o site em B reescrevia o site de A.
    const donaB = api.noHost('bia.vital.app');
    await donaB('POST', '/api/auth/primeiro-acesso',
      { nome: 'Dona B', email: 'b@teste.com', senha: SENHA });
    const r = await donaB('PUT', '/api/config', { slogan: 'só da Bia' });
    assert.equal(r.status, 200);

    const emA = (await api.noHost('lume.vital.app')('GET', '/api/publico/vitrine')).corpo;
    assert.notEqual(emA.negocio.slogan, 'só da Bia');
    assert.equal(emA.negocio.nome, 'Estúdio Lume');

    const emB = (await api.noHost('bia.vital.app')('GET', '/api/publico/vitrine')).corpo;
    assert.equal(emB.negocio.slogan, 'só da Bia');
  });

  test('endereço de ninguém devolve 404, e não o site da empresa padrão', async () => {
    // Cair no padrão seria servir o site de uma empresa no endereço de outra.
    const r = await api.noHost('naoexiste.vital.app')('GET', '/api/publico/vitrine');
    assert.equal(r.status, 404);
  });

  test('empresa suspensa para de responder na porta', async () => {
    await db.db.run(`UPDATE plataforma.tenants SET status = 'suspensa' WHERE id = ?`, B);
    tenant.esquecerCacheDeEmpresas();
    const r = await api.noHost('bia.vital.app')('GET', '/api/publico/vitrine');
    assert.equal(r.status, 403);

    await db.db.run(`UPDATE plataforma.tenants SET status = 'ativa' WHERE id = ?`, B);
    tenant.esquecerCacheDeEmpresas();
    assert.equal((await api.noHost('bia.vital.app')('GET', '/api/publico/vitrine')).status, 200);
  });

  test('localhost e IP continuam sendo a empresa de sempre', async () => {
    for (const host of ['localhost', '127.0.0.1', 'vital.app', 'www.vital.app']) {
      const e = await tenant.resolverTenant({ hostname: host }, db.db);
      assert.equal(e?.id, A, host);
    }
  });

  test('só é subdomínio quando é subdomínio mesmo', () => {
    assert.equal(tenant.subdominioDe('vital.app'), null);
    assert.equal(tenant.subdominioDe('lume.vital.app'), 'lume');
    assert.equal(tenant.subdominioDe('lume.localhost'), 'lume', 'para testar sem DNS');
    assert.equal(tenant.subdominioDe('www.vital.app'), null);
  });
});

describe('a porta do painel', () => {
  test('diz de qual empresa é, e cada endereço responde a sua', async () => {
    // Sem o nome na tela, abrir o endereço errado e cair numa empresa vazia
    // vira um mistério: a pessoa vê "crie o primeiro acesso" na empresa que ela
    // jura que já configurou.
    for (const [host, nome] of [['lume.vital.app', 'Estúdio Lume'], ['bia.vital.app', 'Salão da Bia']]) {
      const r = await api.noHost(host)('GET', '/api/auth/precisa-configurar');
      assert.equal(r.corpo.empresa, nome, host);
    }
  });
});

describe('a sessão não atravessa empresas', () => {
  test('cookie aberto numa empresa não vale na outra', async () => {
    // O dia do subdomínio é o dia em que isto importa: o cookie de quem entrou
    // numa agenda não pode abrir o painel de outra.
    const dona = api.noHost('lume.vital.app');
    const criada = await dona('POST', '/api/auth/primeiro-acesso',
      { nome: 'Dona A', email: 'a@teste.com', senha: SENHA });
    assert.equal(criada.status, 201);

    // Mesmo cliente, mesmo cookie, endereço da outra empresa.
    const eu = await dona('GET', '/api/auth/eu');
    assert.equal(eu.status, 200, 'na própria empresa, continua logada');

    const invasor = api.noHost('bia.vital.app');
    const r = await invasor('GET', '/api/estado');
    assert.equal(r.status, 401, 'sem sessão válida na empresa B');
  });
});
