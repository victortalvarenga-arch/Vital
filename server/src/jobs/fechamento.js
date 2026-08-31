import { db } from '../db.js';
import { hoje, agora } from '../lib/dates.js';
import { registrarDoSistema } from '../lib/registro.js';

/**
 * Fechamento automático: passou a hora, o atendimento conta.
 *
 * ---------------------------------------------------------------------------
 * Por que o padrão é "veio", e não "não veio"
 * ---------------------------------------------------------------------------
 * Quase toda cliente aparece. Exigir um clique por atendimento fazia registrar
 * a REGRA muitas vezes ao dia para que a EXCEÇÃO ficasse implícita — o
 * contrário do que sai barato num balcão cheio.
 *
 * E o custo de não marcar era invisível: `concluido` comanda o dinheiro, a
 * mensagem de pós-atendimento, o "último atendimento" dos modelos e a
 * reativação. Sem ninguém marcar, o CRM inteiro parava — sem erro, sem log,
 * sem sintoma. Alguém só descobriria meses depois, perguntando por que
 * nenhuma cliente recebeu mensagem.
 *
 * Agora a exceção é que se registra: a atendente marca falta ou cancelado a
 * qualquer momento, e o atendimento sai do caixa e do CRM.
 *
 * ---------------------------------------------------------------------------
 * O pagamento entra junto
 * ---------------------------------------------------------------------------
 * Decisão de produto, tomada sabendo do risco: dinheiro passa a aparecer no
 * caixa sem ninguém ter confirmado que entrou. Em troca, o caso comum — veio e
 * pagou — não custa clique nenhum, e o que não bate se conserta pela tela de
 * Atendimentos.
 *
 * **A forma fica no padrão da coluna, 'local'** — "pago no balcão", que é
 * justamente o que se sabe quando ninguém informou nada. Não se chuta pix nem
 * cartão: essas duas alguém precisa ter digitado.
 *
 * ---------------------------------------------------------------------------
 * Rastro
 * ---------------------------------------------------------------------------
 * Cron não tem `req.registrar`. Cada passagem grava uma linha em `logs` como
 * "sistema", com quantos fechou — sem isso o dono veria faturamento aparecer
 * sem autor nenhum.
 */
export async function fecharAtendimentos() {
  const h = hoje();
  const hm = agora();                     // 'HH:MM' no fuso da empresa

  // "Passou a hora" é o FIM do atendimento, não o início: fechar às 14:00 um
  // corte que vai até as 15:00 contaria dinheiro de quem ainda está na cadeira.
  //
  // Dias anteriores entram inteiros; o de hoje, só o que já terminou. Comparar
  // hora como texto funciona porque o formato é 'HH:MM' com zero à esquerda —
  // é o mesmo motivo de data e hora serem texto no projeto inteiro.
  const pendentes = await db.all(
    `SELECT id, client_id, data, hora, duracao, valor
       FROM appointments
      WHERE status IN ('agendado', 'confirmado')
        AND (data < ?
             OR (data = ? AND to_char(
                   (hora::time + make_interval(mins => duracao)), 'HH24:MI') <= ?))
      ORDER BY data, hora`,
    h, h, hm
  );
  if (pendentes.length === 0) return 0;

  const ids = pendentes.map(a => a.id);
  await db.run(
    `UPDATE appointments
        SET status = 'concluido',
            pag_status = CASE WHEN pag_status = 'aberto' THEN 'pago' ELSE pag_status END
      WHERE id IN (${ids.map(() => '?').join(',')})`,
    ...ids
  );

  const total = pendentes.reduce((s, a) => s + Number(a.valor || 0), 0);
  await registrarDoSistema('agendamento.fechado_automaticamente', {
    alvoTipo: 'agendamento',
    resumo: `fechou ${pendentes.length} atendimento${pendentes.length === 1 ? '' : 's'} `
      + `cujo horário já passou (R$ ${total.toFixed(2).replace('.', ',')})`,
    detalhe: { ids, total },
  });

  return pendentes.length;
}
