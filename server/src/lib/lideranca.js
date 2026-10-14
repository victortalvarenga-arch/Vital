import { pool } from '../db.js';

/**
 * Quem roda os jobs, quando há mais de um processo de pé.
 *
 * Sem isto, duas cópias da API disparariam a mesma fila de WhatsApp e o mesmo
 * fechamento de caixa. O `dedupe_key` evita mensagem dupla, mas não o trabalho
 * dobrado, nem dois fechamentos brigando pelo mesmo atendimento.
 *
 * A trava é um *advisory lock* de sessão do Postgres, segurado por uma conexão
 * dedicada enquanto o processo vive. Se o processo morre, a conexão cai e o
 * Postgres solta a trava sozinho — outra cópia assume na próxima tentativa.
 * Não precisa de Redis nem de serviço à parte: o banco que já existe decide.
 *
 * A conexão da trava tem de ser DIRETA (sem pooler): atrás de um pooler em
 * modo transação, a sessão que segura a trava não é a mesma entre comandos.
 */

// Um número fixo para o "assunto" da trava. Qualquer um serve, desde que só
// esta trava o use.
const TRAVA_DOS_JOBS = 727_002_001;

/**
 * Tenta virar quem roda os jobs. Devolve `{ lider: true, soltar }` ou
 * `{ lider: false }` — nunca espera.
 */
export async function tentarLideranca({ aoPerder } = {}) {
  const cliente = await pool.connect();
  try {
    const { rows } = await cliente.query('SELECT pg_try_advisory_lock($1) AS ok', [TRAVA_DOS_JOBS]);
    if (!rows[0].ok) { cliente.release(); return { lider: false }; }
  } catch (erro) {
    cliente.release(true);
    throw erro;
  }

  let solto = false;
  // A conexão da trava caiu (rede, reinício do banco): a trava foi junto, e
  // outra cópia pode estar assumindo. Quem chamou precisa parar os jobs.
  cliente.on('error', erro => {
    if (solto) return;
    solto = true;
    console.error('[jobs] perdi a trava dos jobs:', erro.message);
    try { cliente.release(true); } catch { /* já morta */ }
    aoPerder?.();
  });

  return {
    lider: true,
    async soltar() {
      if (solto) return;
      solto = true;
      try { await cliente.query('SELECT pg_advisory_unlock($1)', [TRAVA_DOS_JOBS]); } finally { cliente.release(); }
    },
  };
}
