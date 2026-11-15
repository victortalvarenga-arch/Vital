import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, limparAgenda, cenario, subirApi, criarEmpresa, apagarEmpresa } from './ambiente.js';

// Antes de qualquer import de `src/`: sem segredo, a pergunta nem é oferecida,
// e é justamente isso que o último caso deste arquivo prova.
process.env.CONEXOES_SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres!!';

/**
 * O aniversário, perguntado depois do agendamento.
 *
 * Ele saiu do formulário na etapa 3 (ROADMAP, Bloco 4c) porque três listas no
 * meio do caminho custam agendamento. Aqui ele volta no único momento em que
 * não atrapalha: a cliente já tem o horário, já leu "tudo certo", e a pergunta
 * é opcional e sem promessa de brinde — "quer receber um parabéns nosso?".
 *
 * **Dia e mês, sem ano.** Ninguém no sistema usa o ano: o job compara
 * `substr(nascimento,6)`, o template corta em `slice(0,5)` e o painel mostra
 * `dd/mm`. Pedir o ano seria uma lista de cem opções para guardar o que nada
 * lê — então o ano fica `'0000'`, que é o jeito de dizer "não informado" sem
 * inventar data e sem coluna nova.
 *
 * **O que protege a escrita é o token**, não a sessão: o site não tem login. O
 * token é assinado (`lib/segredo.js`), vale meia hora, é preso à cliente e à
 * empresa, e tem chave própria — token de outro uso não serve aqui.
 */

const SEM_ANO = '0000';
const VIZINHA = 'vizinha-aniversario';

let db, api, dates, segredo;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  dates = await import('../src/lib/dates.js');
  segredo = await import('../src/lib/segredo.js');

  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
  });
  await criarEmpresa(db, {
    id: VIZINHA, slug: 'vizinha-niver', nome: 'Vizinha', dominio: 'vizinha-niver.teste',
  });
});

after(async () => {
  await apagarEmpresa(VIZINHA);
  const { esquecerCacheDeEmpresas } = await import('../src/lib/tenant.js');
  esquecerCacheDeEmpresas();
  await api?.fechar();
  await db?.pool.end();
});

beforeEach(async () => {
  await db.db.comEmpresa('default', async () => {
    await limparAgenda(db);
    await db.db.run(`DELETE FROM clients WHERE fone <> '47900000001'`);
    await db.db.run(`UPDATE clients SET nascimento = NULL`);
  });
});

const DIA = () => dates.addDias(dates.hoje(), 2);

const agendar = (fone, extra = {}) => api.anonimo()('POST', '/api/publico/agendar', {
  fone, nome: 'Cliente Sem Data',
  servicoId: 's1', profissionalId: 'p1', data: DIA(), hora: '10:00', ...extra,
});

const guardar = (corpo, host) => (host ? api.noHost(host) : api.anonimo())(
  'POST', '/api/publico/aniversario', corpo);

const ficha = fone => db.db.comEmpresa('default', () =>
  db.db.get('SELECT id, nascimento FROM clients WHERE fone=?', fone));

describe('o agendamento oferece a pergunta a quem não tem data', () => {
  test('ficha sem nascimento recebe o token', async () => {
    const r = await agendar('47988880001');
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.ok(r.corpo.aniversario?.token, 'não veio token');
  });

  test('ficha de outra pessoa NÃO recebe convite', async () => {
    // O caso que o `revisor-isolamento` achou: quem digita o número alheio
    // agendava na ficha da outra (buraco do Bloco 4b) e ainda levava um papel
    // que ESCREVE nela. Agora o convite só sai para quem provou ser a dona —
    // ficha nascida agora, ou cliente identificada pelo Google.
    await agendar('47988880020');                       // nasce a ficha
    const r = await agendar('47988880020', { hora: '14:00' });  // agora é ficha que já existe
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.aniversario, null, 'deu papel de escrita em ficha alheia');
  });

  test('ficha que já tem data não recebe nada', async () => {
    await agendar('47988880002');
    await db.db.comEmpresa('default', () =>
      db.db.run(`UPDATE clients SET nascimento = '1990-05-10' WHERE fone = '47988880002'`));
    const r = await agendar('47988880002', { hora: '11:00' });
    assert.equal(r.status, 201, JSON.stringify(r.corpo));
    assert.equal(r.corpo.aniversario, null, 'perguntou para quem já respondeu');
  });

  test('o papel não conta nada a quem o tem na mão', async () => {
    // Era assinado (legível) e levava o id da ficha em claro na resposta de
    // TODO agendamento — achado do `revisor-isolamento` em 2026-11-14. Agora é
    // cifrado: quem o carrega não lê nada, e mexer num byte invalida.
    const { corpo } = await agendar('47988880003');
    const cru = Buffer.from(corpo.aniversario.token, 'base64url').toString('latin1');
    for (const vazamento of ['{', 'c":', 'default', 'em"']) {
      assert.ok(!cru.includes(vazamento), `o papel está legível: ${cru.slice(0, 40)}`);
    }
  });
});

describe('guardar o dia e o mês', () => {
  test('grava com ano 0000, sem inventar data', async () => {
    const { corpo } = await agendar('47988880004');
    const r = await guardar({ token: corpo.aniversario.token, dia: 10, mes: 5 });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal((await ficha('47988880004')).nascimento, `${SEM_ANO}-05-10`);
  });

  test('dia que não existe no mês é recusado', async () => {
    const { corpo } = await agendar('47988880005');
    const r = await guardar({ token: corpo.aniversario.token, dia: 31, mes: 2 });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    assert.equal((await ficha('47988880005')).nascimento, null);
  });

  test('29 de fevereiro existe, e precisa continuar passando', async () => {
    // Quem nasceu em 29/02 recebe a mensagem só nos anos bissextos, e isso é
    // problema do job, não deste campo: recusar a data aqui seria dizer à
    // pessoa que o aniversário dela não existe.
    const { corpo } = await agendar('47988880006');
    const r = await guardar({ token: corpo.aniversario.token, dia: 29, mes: 2 });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal((await ficha('47988880006')).nascimento, `${SEM_ANO}-02-29`);
  });

  test('não sobrescreve data que já existe', async () => {
    const { corpo } = await agendar('47988880007');
    await db.db.comEmpresa('default', () =>
      db.db.run(`UPDATE clients SET nascimento = '1988-03-05' WHERE fone = '47988880007'`));
    const r = await guardar({ token: corpo.aniversario.token, dia: 10, mes: 5 });
    // Responde igual: dizer "já tem" contaria algo da ficha a quem só tem um
    // token na mão.
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal((await ficha('47988880007')).nascimento, '1988-03-05');
  });
});

describe('sem token válido não se escreve nada', () => {
  test('sem token: 401', async () => {
    const r = await guardar({ dia: 10, mes: 5 });
    assert.equal(r.status, 401, JSON.stringify(r.corpo));
  });

  test('token adulterado: 401', async () => {
    const { corpo } = await agendar('47988880008');
    const assinatura = corpo.aniversario.token.split('.')[1];
    const outro = Buffer.from(JSON.stringify({ c: 'c1', t: 'default', em: Date.now() })).toString('base64url');
    const r = await guardar({ token: `${outro}.${assinatura}`, dia: 10, mes: 5 });
    assert.equal(r.status, 401, JSON.stringify(r.corpo));
    assert.equal((await ficha('47988880008')).nascimento, null);
  });

  test('papel vencido: 401', async () => {
    await agendar('47988880009');
    const alvo = await ficha('47988880009');
    // Feito com a hora de 31 minutos atrás, pela chave de verdade: é o prazo
    // que precisa recusar, não o conteúdo.
    const real = Date.now;
    Date.now = () => real() - 31 * 60_000;
    const vencido = segredo.convidarAniversario({ c: alvo.id, t: 'default' });
    Date.now = real;

    const r = await guardar({ token: vencido, dia: 10, mes: 5 });
    assert.equal(r.status, 401, JSON.stringify(r.corpo));
    assert.equal((await ficha('47988880009')).nascimento, null);
  });

  test('papel do OAuth não serve aqui: cada uso tem a sua chave', async () => {
    await agendar('47988880010');
    const alvo = await ficha('47988880010');
    const r = await guardar({ token: segredo.assinarEstado({ c: alvo.id, t: 'default' }), dia: 10, mes: 5 });
    assert.equal(r.status, 401, JSON.stringify(r.corpo));
    assert.equal((await ficha('47988880010')).nascimento, null);
  });

  test('token de uma empresa não escreve na ficha de outra', async () => {
    const { corpo } = await agendar('47988880011');
    const r = await guardar({ token: corpo.aniversario.token, dia: 10, mes: 5 }, 'vizinha-niver.teste');
    assert.equal(r.status, 401, JSON.stringify(r.corpo));
    assert.equal((await ficha('47988880011')).nascimento, null);
  });
});

describe('sem CONEXOES_SEGREDO o agendamento não quebra', () => {
  test('a pergunta some, e o horário continua sendo marcado', async () => {
    const guardado = process.env.CONEXOES_SEGREDO;
    process.env.CONEXOES_SEGREDO = '';
    try {
      const r = await agendar('47988880012');
      // Sem o segredo, `lib/segredo.js` lança 503. A pergunta do aniversário é
      // o que há de mais dispensável no fluxo: ela some, e o agendamento — que
      // é o produto — acontece.
      assert.equal(r.status, 201, JSON.stringify(r.corpo));
      assert.equal(r.corpo.aniversario, null);
    } finally {
      process.env.CONEXOES_SEGREDO = guardado;
    }
  });
});
