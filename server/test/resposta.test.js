import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import { prepararBanco, limpar, cenario, subirApi } from './ambiente.js';

/**
 * O que a resposta carrega, além do dado.
 *
 * - **Compressão.** O Fly cobra o GB que sai da máquina. Sem compressão, o
 *   JSON e o JavaScript saem do tamanho cheio — numa enxurrada de pedidos, é a
 *   linha que cresce na fatura. E o celular de quem agenda baixa o triplo.
 * - **Erro sem mapa.** Erro de banco carrega nome de tabela, coluna e
 *   restrição. Devolver isso ao navegador é ensinar o esquema a quem provoca
 *   erro de propósito numa rota pública.
 */

let db, api;

before(async () => {
  db = await prepararBanco();
  api = await subirApi();
  await db.db.comEmpresa('default', async () => {
    await limpar(db);
    await cenario(db);
  });
});

after(async () => {
  await api?.fechar();
  await db?.pool.end();
});

/**
 * Pedido cru, sem o cliente do `ambiente.js`: aquele não manda
 * `Accept-Encoding` e serializa o corpo sempre — aqui é preciso controlar os
 * dois. Devolve os bytes como chegaram, sem descomprimir.
 */
function pedirCru({ metodo = 'GET', caminho, cabecalhos = {}, corpo }) {
  return new Promise((ok, falha) => {
    const req = http.request(`${api.base}${caminho}`, { method: metodo, headers: cabecalhos }, res => {
      const partes = [];
      res.on('data', p => partes.push(p));
      res.on('end', () => ok({ status: res.statusCode, cabecalhos: res.headers, bytes: Buffer.concat(partes) }));
    });
    req.on('error', falha);
    if (corpo !== undefined) req.write(corpo);
    req.end();
  });
}

describe('a resposta sai comprimida', () => {
  test('quem aceita gzip recebe gzip, e o conteúdo é o mesmo', async () => {
    const cheio = await pedirCru({ caminho: '/api/publico/vitrine' });
    // Abaixo de ~1 KB não vale comprimir, e o teste não provaria nada.
    assert.ok(cheio.bytes.length > 1024, `vitrine pequena demais para o teste: ${cheio.bytes.length} bytes`);

    const r = await pedirCru({ caminho: '/api/publico/vitrine', cabecalhos: { 'accept-encoding': 'gzip' } });
    assert.equal(r.status, 200);
    assert.equal(r.cabecalhos['content-encoding'], 'gzip');
    assert.ok(r.bytes.length < cheio.bytes.length / 2,
      `comprimido ${r.bytes.length} bytes, cheio ${cheio.bytes.length}`);
    assert.deepEqual(JSON.parse(zlib.gunzipSync(r.bytes)), JSON.parse(cheio.bytes));
  });

  test('quem não aceita recebe o texto puro', async () => {
    const r = await pedirCru({ caminho: '/api/publico/vitrine' });
    assert.equal(r.cabecalhos['content-encoding'], undefined);
    assert.doesNotThrow(() => JSON.parse(r.bytes));
  });
});

describe('o erro não mostra o que há por dentro', () => {
  test('JSON malformado é pedido errado (400), não falha do servidor', async () => {
    const r = await pedirCru({
      metodo: 'POST', caminho: '/api/publico/evento',
      cabecalhos: { 'content-type': 'application/json' }, corpo: '{isto não é json',
    });
    assert.equal(r.status, 400);
    const corpo = JSON.parse(r.bytes);
    assert.ok(corpo.erro, 'a tela lê o campo erro');
    assert.equal(corpo.detalhe, undefined);
    assert.doesNotMatch(JSON.stringify(corpo), /token|position|JSON\.parse|Unexpected/i);
  });

  test('falha de verdade sai como "erro interno", sem a mensagem de dentro', async () => {
    // Uma rota de mentira que quebra como o banco quebra, com o tratador de
    // erro de verdade. Provocar um erro de banco real por uma rota pública
    // seria, ele mesmo, um bug a corrigir.
    const express = (await import('express')).default;
    const { tratarErro } = await import('../src/lib/erro.js');
    const app = express();
    app.get('/quebra', () => { throw new Error('relation "form_answers" violates constraint "fa_cliente_fk"'); });
    app.use(tratarErro);
    const servidor = app.listen(0);
    await new Promise(ok => servidor.once('listening', ok));
    const erroOriginal = console.error;
    console.error = () => {}; // o log é o lugar certo do detalhe; aqui só polui a saída
    try {
      const r = await new Promise((ok, falha) => {
        http.get(`http://127.0.0.1:${servidor.address().port}/quebra`, res => {
          let t = ''; res.on('data', p => { t += p; }); res.on('end', () => ok({ status: res.statusCode, t }));
        }).on('error', falha);
      });
      assert.equal(r.status, 500);
      assert.deepEqual(JSON.parse(r.t), { erro: 'erro interno' });
    } finally {
      console.error = erroOriginal;
      await new Promise(ok => servidor.close(ok));
    }
  });
});
