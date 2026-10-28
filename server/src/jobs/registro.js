import { db } from '../db.js';

/**
 * Poda o registro do painel: o que passou de dois anos sai.
 *
 * A aplicação não tem DELETE em `logs`; quem apaga é a função do banco, e só
 * o que passou do prazo (migration 027). Como o funil, não roda por empresa:
 * o prazo é da plataforma, e a função cuida de todas de uma vez.
 */

/** Dois anos, decisão do dono (2026-10-28). A função recusa menos de um. */
export const RETENCAO_DIAS = Number(process.env.REGISTRO_RETENCAO_DIAS || 730);

export async function podarRegistro({ retencao = RETENCAO_DIAS } = {}) {
  const r = await db.get('SELECT plataforma.podar_registro(?) AS apagadas', retencao);
  const apagadas = Number(r?.apagadas || 0);
  if (apagadas) console.log(`[registro] ${apagadas} linha(s) com mais de ${retencao} dias apagada(s)`);
  return apagadas;
}
