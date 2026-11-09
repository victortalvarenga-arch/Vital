import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  prepararBanco, limpar, limparAgenda, cenario, subirApi, comoAdmin, criarEmpresa,
} from './ambiente.js';

/**
 * O limite de chamadas das rotas abertas do site.
 *
 * É o único arquivo da suíte que roda com o limite LIGADO — os outros o
 * desligam em `prepararBanco()`, senão um teste que agenda quinze vezes
 * falharia por um motivo que não é o dele.
 *
 * O que precisa continuar valendo:
 *
 * - quem estoura leva 429 e `Retry-After`, não um erro de banco;
 * - cada rota tem balde próprio: abusar do funil não pode travar o
 *   agendamento de quem está tentando marcar horário;
 * - o limite vale por empresa: quem abusa do site de uma não trava a outra;
 * - o 429 acontece ANTES de escrever no banco.
 */

let db, api, zerarLimites;

before(async () => {
  db = await prepararBanco();
  ({ zerarLimites } = await import('../src/lib/limite.js'));
  api = await subirApi();

  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
  });
  // `prepararBanco()` desligou; aqui é o único lugar que quer o limite de pé.
  process.env.RATE_LIMIT = 'on';
});

after(async () => {
  // Desligar de novo, senão a ordem dos arquivos decide se os outros passam.
  process.env.RATE_LIMIT = 'off';
  await api?.fechar();
  await db?.pool.end();
});

beforeEach(async () => {
  zerarLimites();
  await db.db.comEmpresa('default', () => limparAgenda(db));
  await comoAdmin('DELETE FROM funil');
});

const sessao = n => String(n).padStart(32, '0');

/** Chama N vezes e devolve os status, na ordem. */
async function repetir(n, fn) {
  const status = [];
  for (let i = 0; i < n; i++) status.push((await fn(i)).status);
  return status;
}

describe('o funil tem teto', () => {
  const evento = i => api.anonimo()('POST', '/api/publico/evento',
    { sessao: sessao(i + 1), etapa: 'site' });

  test('passa dentro do limite e recusa depois dele', async () => {
    const status = await repetir(125, evento);
    assert.equal(status[0], 204);
    assert.equal(status[119], 204, 'a 120ª ainda passa');
    assert.equal(status[120], 429, 'a 121ª não');
    assert.equal(status.at(-1), 429);
  });

  test('o 429 diz quando voltar', async () => {
    await repetir(120, evento);
    const r = await api.anonimo()('POST', '/api/publico/evento',
      { sessao: sessao(999), etapa: 'site' });
    assert.equal(r.status, 429);
    assert.match(r.corpo.erro, /tentativas/i);
  });

  test('o que foi recusado não chegou ao banco', async () => {
    await repetir(140, evento);
    const { n } = await db.db.comEmpresa('default', () =>
      db.db.get('SELECT count(*)::int n FROM funil'));
    assert.equal(n, 120, 'o limite barra antes da escrita, não depois');
  });
});

describe('cada rota tem o próprio balde', () => {
  test('estourar o funil não impede ninguém de agendar', async () => {
    // O caso que o balde único estragaria: um robô moendo `/evento` deixaria
    // a cliente sem conseguir marcar horário pelo mesmo NAT.
    await repetir(130, i => api.anonimo()('POST', '/api/publico/evento',
      { sessao: sessao(i + 1), etapa: 'site' }));

    const r = await api.anonimo()('POST', '/api/publico/agendar', {
      fone: '47900000001', servicoId: 's1', profissionalId: 'p1',
      data: '2027-06-10', hora: '10:00',
    });
    assert.equal(r.status, 201);
  });

  test('agendar tem teto próprio, bem mais baixo', async () => {
    const status = await repetir(12, i => api.anonimo()('POST', '/api/publico/agendar', {
      fone: '47900000001', servicoId: 's1', profissionalId: 'p1',
      data: '2027-06-11', hora: `${String(9 + i).padStart(2, '0')}:00`,
    }));
    assert.equal(status.filter(s => s === 429).length, 2, 'dez passam, o resto não');
  });

  test('identificar é o mais apertado — é ele que diz quem é cliente', async () => {
    const status = await repetir(32, i => api.anonimo()('POST', '/api/publico/identificar',
      { fone: `4790000${String(1000 + i)}` }));
    assert.equal(status[29], 200);
    assert.equal(status[30], 429, 'varrer telefone um a um para aqui');
  });
});

describe('o limite é por empresa', () => {
  test('abusar do site de uma não trava a outra', async () => {
    // Uma empresa de verdade, com domínio próprio. Um host qualquer não serve:
    // host desconhecido cai na empresa padrão, que é justamente a que está
    // sendo abusada — foi assim que este teste pegou o próprio erro.
    await criarEmpresa(db, {
      id: 'vizinha-limite', slug: 'vizinha', nome: 'Vizinha', dominio: 'vizinha-limite.teste',
    });
    try {
      await repetir(130, i => api.anonimo()('POST', '/api/publico/evento',
        { sessao: sessao(i + 1), etapa: 'site' }));

      // Mesmo IP, outra empresa, outro balde. Sem isso, uma empresa-cliente
      // conseguiria derrubar a medição da vizinha só moendo o próprio site.
      const outra = api.noHost('vizinha-limite.teste');
      const r = await outra('POST', '/api/publico/evento', { sessao: sessao(1), etapa: 'site' });
      assert.equal(r.status, 204);
    } finally {
      await comoAdmin(`DELETE FROM funil WHERE tenant_id = 'vizinha-limite'`);
      await comoAdmin(`DELETE FROM plataforma.tenants WHERE id = 'vizinha-limite'`);
    }
  });
});

describe('a leitura do site tem teto', () => {
  // Vitrine, horários e dias livres não escrevem nada, mas cada pedido faz
  // várias consultas. Um script pedindo em laço ocupa o banco e a única
  // máquina, e o site sai do ar para todas as empresas. Teto alto: uma visita
  // de verdade faz umas dezenas de leituras, nunca centenas por minuto.
  const ler = [
    () => api.anonimo()('GET', '/api/publico/vitrine'),
    () => api.anonimo()('GET', '/api/publico/horarios?servicoId=s1&data=2027-06-10'),
    () => api.anonimo()('GET', '/api/publico/dias-livres?servicoId=s1&mes=2027-06'),
  ];

  test('trezentas leituras por minuto passam, a seguinte não', async () => {
    const status = await repetir(301, i => ler[i % 3]());
    assert.equal(status.filter(s => s === 429).length, 1, `só a última é barrada: ${status.slice(-3)}`);
    assert.equal(status[300], 429);
  });

  test('as três rotas contam juntas: alternar entre elas não escapa do teto', async () => {
    await repetir(300, () => ler[0]());
    assert.equal((await ler[1]()).status, 429);
    assert.equal((await ler[2]()).status, 429);
  });

  // A página inicial também lê o banco (o `<head>` com o nome da empresa). Só
  // existe com o front compilado em `web/dist`; sem ele a rota nem é montada.
  const temBuild = existsSync(new URL('../../web/dist/index.html', import.meta.url));
  test('a página inicial tem teto próprio', { skip: !temBuild && 'sem web/dist: rode npm run build na raiz' }, async () => {
    const status = await repetir(301, () => api.anonimo()('GET', '/'));
    assert.equal(status[299], 200);
    assert.equal(status[300], 429);
  });
});

describe('o login da equipe da Vital tem teto', () => {
  // É o login com mais poder do sistema: entra no back-office de todas as
  // empresas. E cada tentativa roda um argon2, então sem teto ele servia
  // também para ocupar a CPU da única máquina.
  const EMAIL = 'equipe@vital.com';
  const SENHA_CERTA = 'senha-certa-da-equipe';
  const entrar = senha => api.anonimo()('POST', '/api/plataforma/login', { email: EMAIL, senha });

  beforeEach(async () => {
    await comoAdmin('DELETE FROM plataforma.sessoes');
    await comoAdmin('DELETE FROM plataforma.auditoria');
    await comoAdmin('DELETE FROM plataforma.usuarios');
    const r = await api.anonimo()('POST', '/api/plataforma/primeiro-acesso',
      { nome: 'Equipe', email: EMAIL, senha: SENHA_CERTA });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    zerarLimites(); // o primeiro acesso acima não conta para o teste
  });

  test('dez senhas erradas passam pela conferência, a décima primeira não', async () => {
    const status = await repetir(11, i => entrar(`errada-${i}`));
    assert.deepEqual(status.slice(0, 10), Array(10).fill(401));
    assert.equal(status[10], 429);
  });

  test('estourado o teto, nem a senha certa entra', async () => {
    // Prova que o limite barra antes de olhar a senha. Se só barrasse o erro,
    // quem chuta continuaria descobrindo a senha certa pelo 200.
    await repetir(10, i => entrar(`errada-${i}`));
    const r = await entrar(SENHA_CERTA);
    assert.equal(r.status, 429);
    assert.match(r.corpo.erro, /tentativas/i);
  });

  test('o primeiro acesso também tem teto', async () => {
    // Já existe gente, então cada chamada é 409. Sem teto, em produção, era
    // chute à vontade da chave de instalação.
    const status = await repetir(7, () => api.anonimo()('POST', '/api/plataforma/primeiro-acesso',
      { nome: 'Outro', email: 'outro@vital.com', senha: SENHA_CERTA }));
    assert.deepEqual(status.slice(0, 5), Array(5).fill(409));
    assert.equal(status[5], 429);
  });
});

describe('desligar', () => {
  test('com RATE_LIMIT=off nada é barrado', async () => {
    // É como a suíte inteira roda, e como um ambiente atrás de WAF poderia
    // rodar: a proteção existe na borda e aqui só atrapalharia.
    process.env.RATE_LIMIT = 'off';
    try {
      const status = await repetir(130, i => api.anonimo()('POST', '/api/publico/evento',
        { sessao: sessao(i + 1), etapa: 'site' }));
      assert.equal(status.filter(s => s === 429).length, 0);
    } finally {
      process.env.RATE_LIMIT = 'on';
    }
  });
});
