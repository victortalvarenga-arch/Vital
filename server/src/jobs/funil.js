import { db } from '../db.js';

/**
 * Compacta o funil: o dia vira uma linha de contagens, e o cru dele sai.
 *
 * Sem isto, `funil` cresce para sempre — até quatro linhas por visita ao site,
 * o que passa `logs` de longe. O desenho e o porquê de cada condição estão na
 * migration 016; o resumo é que **um dia só fecha quando o "compareceu" parou
 * de mudar**, porque ele vem do status do agendamento e status muda depois.
 *
 * Diferente dos outros jobs, este NÃO roda por empresa: a função do banco
 * atravessa o RLS e cuida de todas de uma vez. Percorrer empresa por empresa
 * seria uma transação por empresa para fazer o mesmo trabalho.
 */

/** Quantos dias de visita crua ficam de pé. A tela só oferece até 90. */
export const RETENCAO_DIAS = Number(process.env.FUNIL_RETENCAO_DIAS || 90);

export async function compactarFunil({ retencao = RETENCAO_DIAS } = {}) {
  const r = await db.get('SELECT * FROM plataforma.compactar_funil(?)', retencao);
  const dias = Number(r?.dias_fechados || 0);
  const linhas = Number(r?.linhas_apagadas || 0);
  if (dias || linhas) {
    console.log(`[funil] ${dias} dia(s) fechado(s), ${linhas} linha(s) de visita compactada(s)`);
  }
  return { dias, linhas };
}
