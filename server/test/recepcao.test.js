import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, cenario, subirApi, criarEquipe, agendar, SENHA } from './ambiente.js';

/**
 * O papel de recepção e o convite por link (2026-11-02).
 *
 * A recepção vê a agenda de todas — `escopoDe` devolve `null` para ela, como
 * para a dona. Por isso o que a separa do dinheiro não pode ser o escopo: é o
 * poder `financeiro`, e cada rota que entrega dinheiro ou taxa precisa olhar
 * para ele. Este arquivo confere as portas uma a uma.
 */

let db, api, dona, ana, recepcao;
const impressos = [];
const logOriginal = console.log;
const daqui = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const DIA = daqui(3);

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
    await db.db.run(`UPDATE staff SET comissao = 40`);
    await agendar(db, { prof: 'p1', data: DIA, hora: '10:00' });
    await agendar(db, { prof: 'p2', data: DIA, hora: '14:00' });
  });
  ({ dono: dona, ana } = await criarEquipe(api));
  const r = await dona('POST', '/api/auth/usuarios', {
    nome: 'Júlia', email: 'julia@teste.com', senha: SENHA, papel: 'recepcao',
  });
  assert.equal(r.status, 201, JSON.stringify(r.corpo));
  recepcao = await api.entrar('julia@teste.com', SENHA);
  console.log = (...a) => { impressos.push(a.join(' ')); };
});

after(async () => {
  console.log = logOriginal;
  await api.fechar();
  await db.pool.end();
});

describe('recepção', () => {
  test('nasce sem vínculo na equipe; funcionária continua precisando de um', async () => {
    const sem = await dona('POST', '/api/auth/usuarios', {
      nome: 'Sem', email: 'sem@teste.com', senha: SENHA, papel: 'funcionario',
    });
    assert.equal(sem.status, 400);
  });

  test('vê a agenda de todas as profissionais', async () => {
    const { corpo } = await recepcao('GET', '/api/estado');
    const doDia = corpo.agendamentos.filter(a => a.data === DIA).map(a => a.profissionalId).sort();
    assert.deepEqual(doDia, ['p1', 'p2']);
  });

  test('não vê relatório, taxa de comissão, ficha de saúde nem dinheiro de promoção', async () => {
    assert.equal((await recepcao('GET', '/api/relatorios/resumo')).status, 403);
    assert.equal((await recepcao('GET', '/api/clientes/c1/fichas')).status, 403);
    assert.equal((await recepcao('GET', `/api/agendamentos/a-${DIA}-10:00-p1/respostas`)).status, 403);

    const { corpo } = await recepcao('GET', '/api/estado');
    assert.ok(corpo.profissionais.every(p => p.comissao === null), 'nenhuma taxa de colega');
    assert.ok(corpo.servicos.every(s => s.comissao === null && Object.keys(s.comissoes || {}).length === 0));

    const promo = (await recepcao('GET', '/api/combos/desempenho')).corpo;
    assert.equal(promo.total.receita, null);
    assert.equal(promo.semDinheiro, true);
  });

  test('não mexe em acesso, site nem cadastro de serviço', async () => {
    assert.equal((await recepcao('GET', '/api/auth/usuarios')).status, 403);
    assert.equal((await recepcao('PUT', '/api/config', { nome: 'x' })).status, 403);
    assert.equal((await recepcao('POST', '/api/servicos', { nome: 'x', preco: 1, duracao: 30 })).status, 403);
  });

  test('o registro mostra só o que ela mesma fez', async () => {
    const { corpo } = await recepcao('GET', '/api/logs');
    assert.ok(corpo.every(l => l.usuario === 'Júlia'),
      'a criação do acesso dela, feita pela dona, não aparece');
  });
});

describe('trocar quem atende', () => {
  test('a recepção passa o atendimento para a colega; fica no registro com os dois nomes', async () => {
    const id = `a-${DIA}-10:00-p1`;
    const r = await recepcao('PUT', `/api/agendamentos/${id}`, { profissionalId: 'p2' });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal(r.corpo.profissionalId, 'p2');

    const { corpo } = await dona('GET', `/api/logs?alvoId=${id}`);
    const troca = corpo.find(l => l.acao === 'agendamento.trocou_profissional');
    assert.ok(troca, 'a troca tem ação própria, não "remarcou"');
    assert.match(troca.resumo, /de Ana para Bia/);

    await dona('PUT', `/api/agendamentos/${id}`, { profissionalId: 'p1' });
  });

  test('a profissional não passa a cliente dela para a colega', async () => {
    const r = await ana('PUT', `/api/agendamentos/a-${DIA}-10:00-p1`, { profissionalId: 'p2' });
    assert.equal(r.status, 403);
  });
});

describe('convite por link', () => {
  /** O link sai na resposta e no e-mail; o teste confere que são o mesmo. */
  const tokenDe = link => link?.match(/#convite=([\w-]+)/)?.[1];

  test('a dona convida, a pessoa cria a senha pelo link e entra', async () => {
    impressos.length = 0;
    const r = await dona('POST', '/api/auth/usuarios', {
      nome: 'Carla Nova', email: 'carla@teste.com', papel: 'funcionario', profissionalId: 'p2', convite: true,
    });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    const token = tokenDe(r.corpo.convite);
    assert.ok(token, 'o link volta na resposta');
    await new Promise(ok => setTimeout(ok, 50));
    assert.ok(impressos.join('\n').includes(token), 'e vai no e-mail');

    const nova = 'senha-da-carla-99';
    assert.equal((await api.anonimo()('POST', '/api/auth/redefinir', { token, senha: nova })).status, 200);
    await api.entrar('carla@teste.com', nova);
  });

  test('vale sete dias, não uma hora', async () => {
    const r = await dona('POST', '/api/auth/usuarios', {
      nome: 'Duda', email: 'duda@teste.com', papel: 'recepcao', convite: true,
    });
    const { horas } = await db.db.comEmpresa('default', () => db.db.get(
      `SELECT EXTRACT(EPOCH FROM (r.expira_em - now())) / 3600 AS horas
         FROM redefinicoes_senha r JOIN users u ON u.id = r.user_id WHERE u.email = 'duda@teste.com'`));
    assert.ok(Number(horas) > 24 * 6.9, `expira em ${horas}h`);
    assert.ok(tokenDe(r.corpo.convite));
  });

  test('gerar outro link invalida o anterior; só quem cuida da equipe gera', async () => {
    const lista = (await dona('GET', '/api/auth/usuarios')).corpo;
    const duda = lista.find(u => u.email === 'duda@teste.com');
    const primeiro = tokenDe((await dona('POST', `/api/auth/usuarios/${duda.id}/convite`)).corpo.convite);
    const segundo = tokenDe((await dona('POST', `/api/auth/usuarios/${duda.id}/convite`)).corpo.convite);
    assert.notEqual(primeiro, segundo);
    assert.equal((await api.anonimo()('POST', '/api/auth/redefinir', { token: primeiro, senha: 'qualquer-coisa-1' })).status, 400);

    assert.equal((await recepcao('POST', `/api/auth/usuarios/${duda.id}/convite`)).status, 403);
    assert.equal((await ana('POST', `/api/auth/usuarios/${duda.id}/convite`)).status, 403);
  });

  test('sem convite, a senha continua obrigatória', async () => {
    const r = await dona('POST', '/api/auth/usuarios', {
      nome: 'Eva', email: 'eva@teste.com', papel: 'recepcao',
    });
    assert.equal(r.status, 400);
  });
});
