import 'dotenv/config';
import pg from 'pg';

/**
 * Define a senha do usuário `vital_app` no Postgres local, lendo-a da própria
 * DATABASE_URL.
 *
 * A migration cria o papel mas não define senha — migration vai para o Git, e
 * senha em repositório é como não ter senha. O `.env`, que tem a senha, não é
 * versionado.
 *
 * Só desenvolvimento. Em produção o papel é criado e a senha definida pelo
 * provedor ou pelo cofre de variáveis, nunca por script da aplicação.
 *
 * Precisa rodar DEPOIS das migrations: antes delas o papel ainda não existe.
 */
export async function definirSenhaApp() {
  const url = process.env.DATABASE_URL || '';
  const admin = process.env.DATABASE_ADMIN_URL;

  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error('DATABASE_URL não aponta para localhost; este script só serve para desenvolvimento');
  }
  if (!admin) throw new Error('DATABASE_ADMIN_URL não definida');

  const { username: usuario, password: senha } = new URL(url);
  if (!usuario || !senha) throw new Error('DATABASE_URL precisa ter usuário e senha');

  const pool = new pg.Pool({ connectionString: admin, ssl: false });
  try {
    // ALTER ROLE não aceita parâmetro ($1) nem para o nome nem para a senha, e
    // bloco DO também não. Sobra montar o comando — usando os escapadores do
    // próprio driver, não concatenação crua.
    const papel = pg.Client.prototype.escapeIdentifier(decodeURIComponent(usuario));
    const valor = pg.Client.prototype.escapeLiteral(decodeURIComponent(senha));
    await pool.query(`ALTER ROLE ${papel} PASSWORD ${valor}`);
    return decodeURIComponent(usuario);
  } finally {
    await pool.end();
  }
}

// Também roda sozinho: `npm run senha-app`.
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  definirSenhaApp()
    .then(u => console.log(`Senha de ${u} definida a partir do .env.`))
    .catch(e => { console.error(`\n  ${e.message}\n`); process.exit(1); });
}
