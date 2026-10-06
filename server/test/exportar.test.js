import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararBanco, limpar, cenario, subirApi, criarEquipe, criarEmpresa } from './ambiente.js';

/**
 * Exportação dos dados da empresa em CSV.
 *
 * O que importa provar aqui, em ordem de estrago se falhar:
 *
 * 1. **Só o dono baixa.** A funcionária que sai levando a base de clientes é o
 *    caso que a guarda existe para impedir — e esconder o botão não impede.
 * 2. **Só a própria empresa sai no arquivo.** É uma leitura da tabela inteira,
 *    sem filtro nenhum no código; quem segura é o RLS.
 * 3. **O arquivo abre certo no Excel brasileiro** — e não executa fórmula
 *    plantada por quem se cadastrou pelo site.
 */

const B = 'empresa-b';
const DIA = '2027-03-05';
let db, api, dona, ana;

/** CSV em linhas de células. Basta para o que o teste confere: sem `;` dentro de aspas. */
const tabela = texto => texto.replace(/^﻿/, '').trim().split('\r\n').map(l => l.split(';'));

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  await criarEmpresa(db, { id: B, slug: 'bia', nome: 'Salão da Bia' });

  await db.db.comEmpresa(B, async () => {
    await limpar(db);
    await cenario(db, { prefixo: 'b-' });
    await db.db.run(`UPDATE clients SET nome = 'Cliente Só da B' WHERE id = 'b-c1'`);
  });

  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
    await db.db.run(`UPDATE clients SET nome = 'Conceição Araújo', optin = 0 WHERE id = 'c1'`);
    await db.db.run(
      `INSERT INTO clients (id,nome,fone,criado_em) VALUES ('c2', ?, '47900000002', '2026-01-01')`,
      '=HIPERLINK("http://golpe.example")'
    );
    const ag = (id, hora, status, recebido) => db.db.run(
      `INSERT INTO appointments (id,client_id,service_id,staff_id,data,hora,duracao,valor,status,pag_status,pag_recebido,pag_forma,criado_em)
       VALUES (?,?,?,?,?,?,60,100,?,?,?,'pix','2026-01-01')`,
      id, 'c1', 's1', 'p1', DIA, hora, status, recebido >= 100 ? 'pago' : recebido > 0 ? 'parcial' : 'aberto', recebido
    );
    await ag('a1', '10:00', 'concluido', 100);
    await ag('a2', '11:00', 'agendado', 40);
    await ag('a3', '12:00', 'cancelado', 0);
  });

  ({ dono: dona, ana } = await criarEquipe(api));
});

after(async () => {
  await api.fechar();
  await db.pool.end();
});

describe('quem pode baixar', () => {
  for (const arquivo of ['clientes.csv', 'agendamentos.csv']) {
    test(`a funcionária não baixa ${arquivo}`, async () => {
      const r = await ana('GET', `/api/exportar/${arquivo}`);
      assert.equal(r.status, 403, 'esconder o botão não basta: a rota tem de recusar');
    });

    test(`sem login não baixa ${arquivo}`, async () => {
      const r = await api.anonimo()('GET', `/api/exportar/${arquivo}`);
      assert.equal(r.status, 401);
    });
  }
});

describe('clientes.csv', () => {
  test('vem como anexo, sem cache, com BOM e separado por ponto e vírgula', async () => {
    const r = await dona('GET', '/api/exportar/clientes.csv');
    assert.equal(r.status, 200, String(r.corpo));
    assert.match(r.cabecalhos['content-type'], /^text\/csv; charset=utf-8/);
    assert.match(r.cabecalhos['content-disposition'], /^attachment; filename="clientes-.+-\d{4}-\d{2}-\d{2}\.csv"$/);
    assert.equal(r.cabecalhos['cache-control'], 'no-store', 'dado pessoal não fica em cache');
    assert.ok(r.corpo.startsWith('﻿'), 'sem BOM o Excel estraga os acentos');
    assert.equal(tabela(r.corpo)[0][0], 'Nome');
  });

  test('traz as clientes desta empresa e nenhuma da outra', async () => {
    const { corpo } = await dona('GET', '/api/exportar/clientes.csv');
    const nomes = tabela(corpo).slice(1).map(l => l[0]);
    assert.ok(nomes.includes('Conceição Araújo'));
    assert.ok(!corpo.includes('Só da B'), 'a exportação não pode atravessar empresas');
  });

  test('telefone formatado, consentimento por extenso e métricas sem os cancelados', async () => {
    const t = tabela((await dona('GET', '/api/exportar/clientes.csv')).corpo);
    const col = nome => t[0].indexOf(nome);
    const c = t.find(l => l[0] === 'Conceição Araújo');
    assert.equal(c[col('WhatsApp')], '(47) 90000-0001');
    assert.equal(c[col('Aceita mensagens de marketing')], 'Não');
    assert.equal(c[col('Visitas')], '2', 'o cancelado não conta como visita');
    assert.equal(c[col('Total pago (R$)')], '140,00', 'vírgula decimal, que o Excel daqui soma');
  });

  test('nome que parece fórmula sai como texto', async () => {
    const { corpo } = await dona('GET', '/api/exportar/clientes.csv');
    // Com o apóstrofo o Excel mostra o texto; sem ele, monta um link clicável.
    assert.ok(corpo.includes(`"'=HIPERLINK(""http://golpe.example"")"`), corpo);
  });

  test('a exportação fica no registro do painel', async () => {
    await dona('GET', '/api/exportar/clientes.csv');
    const { corpo } = await dona('GET', '/api/logs?acao=exportacao');
    assert.ok(corpo.some(l => l.acao === 'exportacao.clientes'));
  });
});

describe('agendamentos.csv', () => {
  test('uma linha por agendamento, com nomes no lugar de ids', async () => {
    const r = await dona('GET', '/api/exportar/agendamentos.csv');
    assert.equal(r.status, 200);
    const t = tabela(r.corpo);
    const col = nome => t[0].indexOf(nome);
    assert.equal(t.length - 1, 3, 'o cancelado também sai: é histórico');

    const a2 = t.find(l => l[col('Código')] === 'a2');
    assert.equal(a2[col('Cliente')], 'Conceição Araújo');
    assert.equal(a2[col('Serviço')], 'Corte');
    assert.equal(a2[col('Profissional')], 'Ana');
    assert.equal(a2[col('Situação')], 'Agendado');
    assert.equal(a2[col('Valor (R$)')], '100,00');
    assert.equal(a2[col('Recebido (R$)')], '40,00');
    assert.equal(a2[col('Pagamento')], 'Parcial');
    assert.equal(a2[col('Forma de pagamento')], 'Pix');

    const a1 = t.find(l => l[col('Código')] === 'a1');
    assert.equal(a1[col('Situação')], 'Concluído');
  });
});
