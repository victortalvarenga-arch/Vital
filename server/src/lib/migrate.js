import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pasta = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations');

/**
 * Migrations versionadas numa tabela de controle.
 *
 * No SQLite isto era `PRAGMA user_version`, um número só. O Postgres não tem
 * equivalente, e a tabela acabou sendo melhor: guarda qual arquivo rodou e
 * quando, então dá para auditar o histórico do banco em produção.
 *
 * Cada arquivo roda uma vez, na ordem do nome, dentro de uma transação — ou a
 * migration inteira aplica, ou nada dela aplica. O Postgres, diferente do
 * SQLite, também faz DDL dentro de transação, então até um CREATE TABLE que
 * falha no meio não deixa tabela pela metade.
 *
 * Regra ao adicionar arquivo novo: nunca edite uma migration já aplicada em
 * algum banco. Crie a próxima.
 */
export async function migrar(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      versao     INTEGER PRIMARY KEY,
      arquivo    TEXT NOT NULL,
      aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const arquivos = fs.readdirSync(pasta).filter(f => f.endsWith('.sql')).sort();
  const { rows } = await pool.query('SELECT versao FROM schema_migrations');
  const jaAplicadas = new Set(rows.map(r => r.versao));

  const pendentes = arquivos.filter(f => !jaAplicadas.has(numeroDe(f)));
  if (!pendentes.length) return [];

  const aplicadas = [];
  for (const arquivo of pendentes) {
    const versao = numeroDe(arquivo);
    const sql = fs.readFileSync(path.join(pasta, arquivo), 'utf8');
    const cliente = await pool.connect();

    try {
      await cliente.query('BEGIN');
      await cliente.query(sql);
      await cliente.query(
        'INSERT INTO schema_migrations (versao, arquivo) VALUES ($1, $2)',
        [versao, arquivo]
      );
      await cliente.query('COMMIT');
      aplicadas.push(arquivo);
      console.log(`  migration aplicada: ${arquivo}`);
    } catch (erro) {
      await cliente.query('ROLLBACK');
      throw new Error(`migration ${arquivo} falhou e foi desfeita: ${erro.message}`);
    } finally {
      cliente.release();
    }
  }

  return aplicadas;
}

function numeroDe(arquivo) {
  const n = parseInt(arquivo.slice(0, 3), 10);
  if (Number.isNaN(n)) throw new Error(`migration sem número no começo do nome: ${arquivo}`);
  return n;
}
