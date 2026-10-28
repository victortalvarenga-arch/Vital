import { db, uid } from '../db.js';
import { addDias, hoje } from '../lib/dates.js';

/**
 * Estende as séries de bloqueio que "nunca terminam".
 *
 * A regra mora em `bloqueio_series` (migration 028); as ocorrências são linhas
 * comuns de `blocks`. Este job, por empresa, cria as datas que faltam para a
 * série ter sempre 12 meses à frente. Só cria depois de `ate`, a última data
 * já criada — uma ocorrência que alguém liberou à mão ficou para trás e não
 * volta.
 */

/** Quantos dias à frente uma série sem fim mantém criados. */
export const HORIZONTE_DIAS = 365;

/**
 * As datas da regra entre `depois` (exclusive) e `limite` (inclusive).
 *
 * As mesmas três regras de `gerarDatas` em painel/Bloqueios.jsx: o mensal soma
 * mês a partir do início (dia 31 escorrega como o `Date` faz), o semanal olha o
 * dia da semana. Mudar uma regra lá é mudar aqui.
 */
export function proximasDatas({ repetir, diasSemana = [], inicio }, depois, limite) {
  const saida = [];
  if (repetir === 'mensal') {
    for (let i = 0; ; i++) {
      const d = maisMeses(inicio, i);
      if (d > limite) break;
      if (d > depois) saida.push(d);
    }
    return saida;
  }
  for (let d = addDias(depois, 1); d <= limite; d = addDias(d, 1)) {
    if (repetir === 'diaria' || diasSemana.includes(new Date(d + 'T12:00:00').getDay())) saida.push(d);
  }
  return saida;
}

function maisMeses(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Roda dentro do contexto de uma empresa (`paraCadaEmpresa`). */
export async function estenderSeries({ hojeISO = hoje() } = {}) {
  const limite = addDias(hojeISO, HORIZONTE_DIAS);
  const series = await db.all('SELECT * FROM bloqueio_series WHERE ate < ?', limite);
  let criadas = 0;
  for (const s of series) {
    // Sem nenhuma ocorrência de pé, a série foi liberada inteira por outro
    // caminho: não ressuscita.
    const viva = await db.get('SELECT 1 FROM blocks WHERE serie = ? LIMIT 1', s.serie);
    if (!viva) { await db.run('DELETE FROM bloqueio_series WHERE serie = ?', s.serie); continue; }

    const datas = proximasDatas(
      { repetir: s.repetir, diasSemana: s.dias_semana || [], inicio: s.inicio }, s.ate, limite
    );
    for (const data of datas) {
      await db.run(
        `INSERT INTO blocks (id, staff_id, data, hora_ini, hora_fim, motivo, obs, serie, criado_em)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        uid(), s.staff_id, data, s.hora_ini, s.hora_fim, s.motivo, s.obs, s.serie, hojeISO
      );
    }
    // `ate` anda até o limite mesmo sem data nova (um mensal pode não ter
    // ocorrência nos próximos dias): a próxima passada começa dali.
    await db.run('UPDATE bloqueio_series SET ate = ? WHERE serie = ?', limite, s.serie);
    criadas += datas.length;
  }
  return criadas;
}
