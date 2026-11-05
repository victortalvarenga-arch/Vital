import { db } from '../db.js';
import { hoje, agora } from '../lib/dates.js';
import { registrarDoSistema } from '../lib/registro.js';

/**
 * Fechamento automático: passou a hora sem ninguém marcar, fica pendente.
 *
 * ---------------------------------------------------------------------------
 * Pendente, e não concluído (decisão de 2026-11-04)
 * ---------------------------------------------------------------------------
 * Até a migration 034 o padrão era "veio": passada a hora, o atendimento virava
 * concluído e pago sozinho, contando que o WhatsApp confirmaria quem veio. Ele
 * ainda não confirma, e o padrão virou dado inventado — a falta que ninguém
 * marcava entrava como comparecimento, a cliente recebia o pós-atendimento e o
 * caixa somava dinheiro que ninguém viu.
 *
 * Agora o relógio só diz o que sabe: o horário passou e ninguém marcou nada.
 * Quem diz se veio é a equipe — "todos vieram" em lote, pelo aviso do Resumo
 * (`POST /api/agendamentos/confirmar-presenca`), ou falta uma a uma, na Lista.
 * Até lá, o atendimento não é visita, não dispara pós-atendimento e não entra
 * no recebido.
 *
 * ---------------------------------------------------------------------------
 * O pagamento fica presumido
 * ---------------------------------------------------------------------------
 * O caso comum continua sendo "pagou no balcão", e o dono quer ver esse
 * dinheiro — mas separado do que alguém registrou. O fechamento marca
 * `pag_presumido` e NÃO mexe em `pag_recebido`: o caixa mostra o recebido
 * confirmado e, em outra linha, o estimado (`valor - pag_recebido` do que é
 * presumido). Quem já pagou tudo antes da hora não tem o que presumir.
 *
 * ---------------------------------------------------------------------------
 * Rastro
 * ---------------------------------------------------------------------------
 * Cada atendimento ganha o próprio evento em `appointment_events`, assinado
 * como sistema/fechamento (migration 031). Em `logs`, uma linha por passagem,
 * para o dono ler na lista do registro.
 */
export async function fecharAtendimentos() {
  const h = hoje();
  const hm = agora();                     // 'HH:MM' no fuso da empresa

  // "Passou a hora" é o FIM do atendimento, não o início: marcar às 14:00 um
  // corte que vai até as 15:00 pediria confirmação de quem ainda está na cadeira.
  //
  // Dias anteriores entram inteiros; o de hoje, só o que já terminou. Comparar
  // hora como texto funciona porque o formato é 'HH:MM' com zero à esquerda —
  // é o mesmo motivo de data e hora serem texto no projeto inteiro.
  const passaram = await db.all(
    `SELECT id, valor, pag_recebido
       FROM appointments
      WHERE status IN ('agendado', 'confirmado', 'em_atendimento')
        AND (data < ?
             OR (data = ? AND to_char(
                   (hora::time + make_interval(mins => duracao)), 'HH24:MI') <= ?))
      ORDER BY data, hora`,
    h, h, hm
  );
  if (passaram.length === 0) return 0;

  const ids = passaram.map(a => a.id);
  // Assinado como fechamento, e não como quem abriu o painel (este job também
  // roda dentro do GET /api/estado).
  await db.comAutoria({ tipo: 'sistema', origem: 'fechamento' }, () => db.run(
    `UPDATE appointments
        SET status = 'pendente',
            pag_presumido = CASE WHEN pag_recebido < valor THEN 1 ELSE 0 END
      WHERE id IN (${ids.map(() => '?').join(',')})`,
    ...ids
  ));

  const estimado = passaram.reduce((s, a) => s + Math.max(0, Number(a.valor || 0) - Number(a.pag_recebido || 0)), 0);
  await registrarDoSistema('agendamento.pendente', {
    alvoTipo: 'agendamento',
    resumo: `${passaram.length} atendimento${passaram.length === 1 ? '' : 's'} passou${passaram.length === 1 ? '' : 'aram'} `
      + `da hora sem marcação · R$ ${estimado.toFixed(2).replace('.', ',')} presumido`,
    detalhe: { ids, estimado },
  });

  return passaram.length;
}
