import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pasta = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations');

/**
 * Migrations versionadas por `PRAGMA user_version`.
 *
 * Antes disso o `schema.sql` inteiro rodava a cada boot, e alterar uma coluna
 * era trabalho manual em cada banco. Aqui cada arquivo roda uma vez só, na
 * ordem do nome, dentro de uma transação: ou a migration inteira aplica, ou
 * nada dela aplica e o banco continua na versão anterior.
 *
 * Regra ao adicionar arquivo novo: nunca edite uma migration já aplicada em
 * algum banco. Crie a próxima.
 */
export function migrar(db) {
  const arquivos = fs.readdirSync(pasta)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const atual = db.pragma('user_version', { simple: true });
  const pendentes = arquivos.filter(f => numeroDe(f) > atual);
  if (!pendentes.length) return { de: atual, para: atual, aplicadas: [] };

  // Reconstruir tabela (é o que a 002 faz com clients) exige derrubar a
  // checagem de chave estrangeira: o DROP intermediário deixaria referências
  // órfãs por um instante. Religamos e conferimos tudo logo depois.
  const fkAntes = db.pragma('foreign_keys', { simple: true });
  db.pragma('foreign_keys = OFF');

  const aplicadas = [];
  try {
    for (const arquivo of pendentes) {
      const versao = numeroDe(arquivo);
      const sql = fs.readFileSync(path.join(pasta, arquivo), 'utf8');

      db.transaction(() => {
        db.exec(sql);
        db.pragma(`user_version = ${versao}`);
      })();

      const violacoes = db.pragma('foreign_key_check');
      if (violacoes.length) {
        throw new Error(
          `migration ${arquivo} deixou ${violacoes.length} referência(s) órfã(s): ` +
          JSON.stringify(violacoes.slice(0, 3))
        );
      }

      aplicadas.push(arquivo);
      console.log(`  migration aplicada: ${arquivo}`);
    }
  } finally {
    if (fkAntes) db.pragma('foreign_keys = ON');
  }

  return { de: atual, para: db.pragma('user_version', { simple: true }), aplicadas };
}

function numeroDe(arquivo) {
  const n = parseInt(arquivo.slice(0, 3), 10);
  if (Number.isNaN(n)) throw new Error(`migration sem número no começo do nome: ${arquivo}`);
  return n;
}
