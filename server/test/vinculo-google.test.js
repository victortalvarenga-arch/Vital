import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, cenario, criarEmpresa, apagarEmpresa, subirApi, criarEquipe, SENHA } from './ambiente.js';

/**
 * A conta Google na ficha da cliente (migration 041).
 *
 * Duas coisas, e as duas são de isolamento:
 *
 * **1. O id da conta é único POR EMPRESA.** O índice nasceu global na 001
 * (`UNIQUE (google_sub)`), o que impediria a mesma pessoa de entrar com a
 * mesma conta no salão e na clínica — duas empresas da Vital, duas fichas
 * dela. Pior: a segunda gravação falharia por colisão com uma linha que o RLS
 * esconde, um erro inexplicável que ainda contaria que aquela conta existe em
 * outra empresa. A coluna estava vazia, então dava para consertar sem migrar
 * dado nenhum.
 *
 * **2. Vínculo pedido não é vínculo feito.** Quando o número digitado já tem
 * ficha e a ficha não tem Google, ninguém liga nada: quem está do outro lado
 * pode ter digitado o telefone de outra pessoa. O pedido fica guardado na
 * própria ficha, e quem confirma é a profissional, no painel. Colunas em
 * `clients` e não tabela à parte: o pedido pertence à ficha, uma ficha tem no
 * máximo um em pé, `clients` já viaja inteira para o painel (a ficha mostra
 * sem consulta nova), e recusar é limpar as colunas — quem recusou já fica no
 * `logs`.
 */

const VIZINHA = 'vizinha-google';
const SUB = '110000000000000000001';

let db, api, dona, ana, recepcao;

before(async () => {
  db = await prepararBanco();
  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
  });
  await criarEmpresa(db, {
    id: VIZINHA, slug: 'vizinha-google', nome: 'Clínica Vizinha', dominio: 'vizinha-google.teste',
  });
  api = await subirApi();
  ({ dono: dona, ana } = await criarEquipe(api));
  // A recepção não vem do `criarEquipe`: ela entrou depois no produto
  // (migration 030), e é justamente o papel que decide esta rota junto do dono.
  await dona('POST', '/api/auth/usuarios', {
    nome: 'Júlia', email: 'julia@vinculo.teste', senha: SENHA, papel: 'recepcao',
  });
  recepcao = await api.entrar('julia@vinculo.teste', SENHA);
});

after(async () => {
  await api?.fechar();
  await apagarEmpresa(VIZINHA);
  const { esquecerCacheDeEmpresas } = await import('../src/lib/tenant.js');
  esquecerCacheDeEmpresas();
  await db?.pool.end();
});

const criar = (empresa, id, nome, fone, extra = '') => db.db.comEmpresa(empresa, () => db.db.run(
  `INSERT INTO clients (id,nome,fone,criado_em${extra ? ',' + extra.campo : ''})
   VALUES (?,?,?,'2026-01-01'${extra ? ',?' : ''})`,
  id, nome, fone, ...(extra ? [extra.valor] : [])
));

describe('a mesma conta Google em duas empresas', () => {
  test('a cliente do salão e da clínica é a mesma pessoa, e entra nas duas', async () => {
    await criar('default', 'g1', 'Teresa no Salão', '47988881001',
      { campo: 'google_sub', valor: SUB });
    await criar(VIZINHA, 'g2', 'Teresa na Clínica', '47988881001',
      { campo: 'google_sub', valor: SUB });

    const noSalao = await db.db.comEmpresa('default', () =>
      db.db.get('SELECT nome FROM clients WHERE google_sub = ?', SUB));
    const naClinica = await db.db.comEmpresa(VIZINHA, () =>
      db.db.get('SELECT nome FROM clients WHERE google_sub = ?', SUB));

    assert.equal(noSalao.nome, 'Teresa no Salão');
    assert.equal(naClinica.nome, 'Teresa na Clínica');
  });

  test('e uma empresa não enxerga o vínculo da outra', async () => {
    const quantas = await db.db.comEmpresa(VIZINHA, () =>
      db.db.all('SELECT id FROM clients WHERE google_sub = ?', SUB));
    assert.equal(quantas.length, 1, 'a vizinha viu mais de uma ficha com essa conta');
  });

  test('mas DENTRO da empresa continua sendo uma ficha por conta', async () => {
    // O conserto não pode virar permissão para duplicar cliente: duas fichas
    // da mesma empresa com a mesma conta é a ficha dividida em duas.
    await assert.rejects(
      () => criar('default', 'g3', 'Teresa de Novo', '47988881002',
        { campo: 'google_sub', valor: SUB }),
      // Pelo NOME do índice, não pelo texto do erro: o Postgres responde no
      // idioma do servidor, e "duplicate key" aqui chega como "duplicar valor
      // da chave" — um teste preso ao texto quebra ao mudar de máquina.
      /idx_clients_google/
    );
  });
});

describe('o pedido de vínculo fica na ficha, sem efetivar', () => {
  test('guarda a conta e o e-mail propostos, e o vínculo continua vazio', async () => {
    await db.db.comEmpresa('default', async () => {
      await db.db.run(
        `INSERT INTO clients (id,nome,fone,criado_em) VALUES ('g4','Ficha Antiga','47988881003','2026-01-01')`
      );
      await db.db.run(
        `UPDATE clients SET google_sub_pendente = ?, email_pendente = ?, vinculo_pedido_em = ?
          WHERE id = 'g4'`,
        '220000000000000000002', 'alguem@gmail.com', '2026-11-14'
      );
      const c = await db.db.get('SELECT * FROM clients WHERE id = ?', 'g4');
      assert.equal(c.google_sub, null, 'o vínculo foi efetivado sem ninguém confirmar');
      assert.equal(c.google_sub_pendente, '220000000000000000002');
      assert.equal(c.email_pendente, 'alguem@gmail.com');
      assert.equal(c.vinculo_pedido_em, '2026-11-14');
    });
  });

  test('duas fichas podem ter o MESMO pedido pendente', async () => {
    // A mesma pessoa pode pedir vínculo em duas fichas (digitou dois números
    // seus). Enquanto ninguém confirma, nada colide — a unicidade é do
    // vínculo feito, não do pedido.
    await db.db.comEmpresa('default', async () => {
      await db.db.run(
        `INSERT INTO clients (id,nome,fone,criado_em,google_sub_pendente)
         VALUES ('g5','Outra Ficha','47988881004','2026-01-01','220000000000000000002')`
      );
      const quantas = await db.db.all(
        'SELECT id FROM clients WHERE google_sub_pendente = ?', '220000000000000000002');
      assert.equal(quantas.length, 2);
    });
  });
});

/**
 * Quem efetiva o vínculo é gente, no painel — nunca a rota pública.
 *
 * O poder é `clientes` (dono e recepção; funcionário não), o mesmo que já
 * governa mexer em ficha. Confirmar entrega a ficha inteira — histórico,
 * endereço, observações — a uma conta do Google, e isso não é decisão de quem
 * só atende a própria agenda.
 */
describe('confirmar e recusar o vínculo, no painel', () => {
  const comPedido = async (id, fone, sub = '330000000000000000003') => {
    await db.db.comEmpresa('default', async () => {
      await db.db.run(
        `INSERT INTO clients (id,nome,fone,criado_em,google_sub_pendente,email_pendente,vinculo_pedido_em)
         VALUES (?,?,?,'2026-01-01',?,?, '2026-11-14')`,
        id, 'Ficha Com Pedido', fone, sub, 'quem.pediu@gmail.com'
      );
    });
  };
  const ler = id => db.db.comEmpresa('default', () =>
    db.db.get('SELECT * FROM clients WHERE id = ?', id));

  test('a ficha chega ao painel com o pedido visível', async () => {
    await comPedido('v1', '47988884001');
    const { corpo } = await dona('GET', '/api/clientes');
    const ficha = corpo.find(c => c.id === 'v1');
    // Sem isto o pedido é dado que ninguém lê: nem para confirmar, nem para
    // apagar. Era o estado em que a etapa 8b o deixou.
    assert.equal(ficha.vinculoPendente?.email, 'quem.pediu@gmail.com');
    assert.equal(ficha.vinculoPendente?.pedidoEm, '2026-11-14');
  });

  test('confirmar liga a conta e limpa o pedido', async () => {
    await comPedido('v2', '47988884002');
    const r = await dona('POST', '/api/clientes/v2/vinculo', { confirmar: true });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    const c = await ler('v2');
    assert.equal(c.google_sub, '330000000000000000003');
    assert.equal(c.google_sub_pendente, null);
    assert.equal(c.email_pendente, '');
    assert.equal(c.email, 'quem.pediu@gmail.com', 'o e-mail da conta não foi para a ficha');
  });

  test('recusar apaga o pedido e NÃO liga nada', async () => {
    await comPedido('v3', '47988884003');
    const r = await dona('POST', '/api/clientes/v3/vinculo', { confirmar: false });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    const c = await ler('v3');
    assert.equal(c.google_sub, null);
    assert.equal(c.google_sub_pendente, null);
    assert.equal(c.email_pendente, '');
  });

  test('funcionário não confirma vínculo nenhum', async () => {
    await comPedido('v4', '47988884004');
    const r = await ana('POST', '/api/clientes/v4/vinculo', { confirmar: true });
    assert.equal(r.status, 403, JSON.stringify(r.corpo));
    assert.equal((await ler('v4')).google_sub, null);
  });

  test('a recepção confirma — é ela quem cuida das fichas', async () => {
    await comPedido('v5', '47988884005', '440000000000000000004');
    const r = await recepcao('POST', '/api/clientes/v5/vinculo', { confirmar: true });
    assert.equal(r.status, 200, JSON.stringify(r.corpo));
    assert.equal((await ler('v5')).google_sub, '440000000000000000004');
  });

  test('conta já ligada a outra ficha: 409, e nada muda', async () => {
    // O índice único é por empresa. Sem esta guarda o UPDATE estoura, envenena
    // a transação e a tela vê 500 — o mesmo erro que o PUT de cliente já teve.
    await db.db.comEmpresa('default', () => db.db.run(
      `INSERT INTO clients (id,nome,fone,criado_em,google_sub)
       VALUES ('v6','Já Ligada','47988884006','2026-01-01','550000000000000000005')`
    ));
    await comPedido('v7', '47988884007', '550000000000000000005');
    const r = await dona('POST', '/api/clientes/v7/vinculo', { confirmar: true });
    assert.equal(r.status, 409, JSON.stringify(r.corpo));
    const c = await ler('v7');
    assert.equal(c.google_sub, null);
    assert.equal(c.google_sub_pendente, '550000000000000000005', 'o pedido sumiu num erro');
  });

  test('ficha sem pedido não tem o que confirmar', async () => {
    const r = await dona('POST', '/api/clientes/c1/vinculo', { confirmar: true });
    assert.equal(r.status, 404, JSON.stringify(r.corpo));
  });
});
