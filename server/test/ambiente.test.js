import { before, after, describe, test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * `bancoDescartavel` é o que deixa reset, seed e senha-app apagarem um banco.
 *
 * O caso que importa é o último: o `.env` de desenvolvimento copiado para o
 * servidor de produção carrega `VITAL_BANCO_DESCARTAVEL=sim`, e sem o fecho
 * por `NODE_ENV` o reset voltaria a poder apagar o banco de verdade.
 * Sem conexão nenhuma — só lê variáveis de ambiente.
 */

let bancoDescartavel;
const original = {};
const CHAVES = ['NODE_ENV', 'DATABASE_URL', 'VITAL_BANCO_DESCARTAVEL'];

const ambiente = valores => {
  for (const k of CHAVES) delete process.env[k];
  Object.assign(process.env, valores);
};

before(async () => {
  for (const k of CHAVES) original[k] = process.env[k];
  ({ bancoDescartavel } = await import('../src/lib/ambiente.js'));
});

after(() => {
  for (const k of CHAVES) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

describe('banco descartável', () => {
  test('localhost é descartável', () => {
    ambiente({ DATABASE_URL: 'postgresql://u:s@localhost:5432/vital' });
    assert.equal(bancoDescartavel(), true);
  });

  test('banco remoto sem a variável não é', () => {
    ambiente({ DATABASE_URL: 'postgresql://u:s@ep-x.aws.neon.tech/neondb' });
    assert.equal(bancoDescartavel(), false);
  });

  test('banco remoto com a variável é (o branch dev da Neon)', () => {
    ambiente({
      DATABASE_URL: 'postgresql://u:s@ep-x.aws.neon.tech/neondb',
      VITAL_BANCO_DESCARTAVEL: 'sim',
    });
    assert.equal(bancoDescartavel(), true);
  });

  test('NODE_ENV=production tranca, mesmo com a variável — o .env de dev copiado para produção', () => {
    ambiente({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:s@ep-x.aws.neon.tech/neondb',
      VITAL_BANCO_DESCARTAVEL: 'sim',
    });
    assert.equal(bancoDescartavel(), false);
  });

  test('NODE_ENV=production tranca até localhost — produção não tem banco de brincar', () => {
    ambiente({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:s@localhost:5432/vital' });
    assert.equal(bancoDescartavel(), false);
  });
});
