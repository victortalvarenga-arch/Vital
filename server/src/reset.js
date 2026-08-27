import 'dotenv/config';
import pg from 'pg';

/**
 * Zera o banco. Antes era apagar um arquivo; com Postgres é derrubar os schemas
 * e recriá-los vazios, o que também limpa o controle de migrations — o `seed`
 * seguinte reconstrói tudo do zero.
 *
 * Usa DATABASE_ADMIN_URL, não a conexão da aplicação: `vital_app` de propósito
 * não é dono dos schemas e não consegue derrubá-los. É o mesmo motivo pelo qual
 * ele não ignora Row-Level Security.
 *
 * Só serve para desenvolvimento. Em produção, migration; nunca isto.
 */
const url = process.env.DATABASE_URL || '';
const admin = process.env.DATABASE_ADMIN_URL;

if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error('\n  reset abortado: DATABASE_URL não aponta para localhost.');
  console.error('  Este comando apaga TODOS os dados e só existe para desenvolvimento.\n');
  process.exit(1);
}
if (!admin) {
  console.error('\n  DATABASE_ADMIN_URL não definida — a aplicação não tem permissão para zerar o banco.\n');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: admin, ssl: false });
try {
  await pool.query('DROP SCHEMA IF EXISTS plataforma CASCADE');
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');
  console.log('Banco zerado.');
} finally {
  await pool.end();
}
