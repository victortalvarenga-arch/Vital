import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * A conexão com o banco na nuvem confere o certificado do servidor.
 *
 * Confere a configuração que o `pg` monta de fato, e não só o que `sslPara`
 * devolve: o `sslmode` da URL passa por cima da opção do código, e foi
 * exatamente isso que escondeu um `rejectUnauthorized: false` por meses.
 * Sem conexão de verdade — este teste não depende de ter a Neon à mão.
 */

let sslPara, ConnectionParameters;

before(async () => {
  ({ sslPara } = await import('../src/lib/ambiente.js'));
  ConnectionParameters = (await import('pg/lib/connection-parameters.js')).default;
});

const tlsFinal = url => new ConnectionParameters({ connectionString: url, ssl: sslPara(url) }).ssl;

describe('TLS do banco', () => {
  test('banco local: sem TLS (não tem certificado)', () => {
    assert.equal(tlsFinal('postgresql://u:s@localhost:5432/vital'), false);
  });

  test('URL na nuvem sem sslmode: confere o certificado', () => {
    const ssl = tlsFinal('postgresql://u:s@ep-x.sa-east-1.aws.neon.tech/neondb');
    assert.ok(ssl, 'TLS ligado');
    assert.notEqual(ssl.rejectUnauthorized, false, 'não pode aceitar qualquer certificado');
  });

  test('URL com sslmode=verify-full (a do .env.example): confere o certificado', () => {
    const ssl = tlsFinal('postgresql://u:s@ep-x.sa-east-1.aws.neon.tech/neondb?sslmode=verify-full');
    assert.ok(ssl);
    assert.notEqual(ssl.rejectUnauthorized, false);
  });
});
