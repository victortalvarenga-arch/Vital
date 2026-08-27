import 'dotenv/config';
import { pool } from './db.js';

/**
 * Zera o banco. Antes era apagar um arquivo; com Postgres é derrubar o schema
 * e recriá-lo vazio, o que também limpa o controle de migrations — o `seed`
 * seguinte reconstrói tudo do zero.
 *
 * Só serve para desenvolvimento. Em produção, migration; nunca isto.
 */
if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '')) {
  console.error('\n  reset abortado: DATABASE_URL não aponta para localhost.');
  console.error('  Este comando apaga TODOS os dados e só existe para desenvolvimento.\n');
  process.exit(1);
}

await pool.query('DROP SCHEMA public CASCADE');
await pool.query('CREATE SCHEMA public');
await pool.end();
console.log('Banco zerado.');
