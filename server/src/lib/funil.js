import { db } from '../db.js';
import { hoje } from './dates.js';

/**
 * Os cinco passos até a cadeira: site → agendamento → horário → confirmou →
 * compareceu.
 *
 * Existe para responder uma pergunta que o sistema não sabia responder: **em
 * qual tela as pessoas somem.** Sem isso, qualquer conversa sobre o
 * agendamento é opinião — dá para achar que o calendário afasta, mexer nele
 * por um mês e descobrir depois que a desistência estava no passo do WhatsApp.
 *
 * O modelo (uma linha por sessão e passo, deduplicada pelo banco) está
 * explicado na migration 015. Aqui só o que a aplicação precisa saber:
 *
 * - **gravar nunca pode derrubar o que a pessoa está fazendo.** Medição é
 *   secundária ao agendamento; se o INSERT falhar, o agendamento segue.
 * - **`confirmou` é gravado pelo servidor**, junto da criação do agendamento,
 *   e não pelo navegador. É o único passo com consequência — o que separa
 *   "quase comprou" de "comprou" — e front não é fonte confiável para isso.
 */

/** Os passos que o navegador pode registrar. `confirmou` não está aqui. */
const DO_NAVEGADOR = ['site', 'agendamento', 'horario'];

/** Como `uid()` sorteia: 32 caracteres hexadecimais e nada mais. */
const SESSAO = /^[0-9a-f]{32}$/;

export const etapaDoNavegador = etapa => DO_NAVEGADOR.includes(etapa);
export const sessaoValida = sessao => SESSAO.test(String(sessao || ''));

/**
 * Marca que esta sessão chegou a este passo.
 *
 * `ON CONFLICT DO NOTHING` é a deduplicação: a mesma visita abrindo a janela
 * cinco vezes continua valendo uma. Quem garante isso é a chave primária
 * (empresa, sessão, etapa), não um `SELECT` antes — que abriria corrida entre
 * duas abas.
 *
 * Não devolve nada e nunca lança: quem chama está no meio de um agendamento.
 */
export async function marcar({ sessao, etapa, appointmentId = null }) {
  if (!sessaoValida(sessao)) return;
  try {
    await db.run(
      `INSERT INTO funil (sessao, etapa, data, appointment_id)
       VALUES (?,?,?,?)
       ON CONFLICT DO NOTHING`,
      sessao, etapa, hoje(), appointmentId
    );
  } catch (e) {
    // Medição não derruba venda. Fica no log do servidor e a vida segue.
    console.error('funil: não consegui gravar', etapa, e.message);
  }
}

/**
 * O funil de UMA empresa, para o painel dela.
 *
 * Roda dentro do contexto da empresa (RLS), então não precisa — e não pode —
 * filtrar por `tenant_id` na mão. O back-office da Vital usa outro caminho:
 * `plataforma.funil_por_empresa()`, que atravessa o RLS e devolve só contagem.
 */
export async function funilDaEmpresa({ dias = 30 } = {}) {
  const desde = diasAtras(dias);
  // Dia antigo já virou uma linha de contagens em `funil_diario` e saiu do
  // cru (ver migration 016) — ler só o cru esconderia o passado. Um dia está
  // num OU no outro, nunca nos dois, e é isso que torna a soma segura.
  const r = await db.get(
    `WITH cru AS (
       SELECT count(*) FILTER (WHERE f.etapa = 'site')        AS site,
              count(*) FILTER (WHERE f.etapa = 'agendamento') AS agendamento,
              count(*) FILTER (WHERE f.etapa = 'horario')     AS horario,
              count(*) FILTER (WHERE f.etapa = 'confirmou')   AS confirmou,
              count(*) FILTER (WHERE f.etapa = 'confirmou' AND a.status = 'concluido') AS compareceu
         FROM funil f
         LEFT JOIN appointments a ON a.id = f.appointment_id
        WHERE f.data >= ?
     ),
     resumo AS (
       SELECT coalesce(sum(site), 0) site, coalesce(sum(agendamento), 0) agendamento,
              coalesce(sum(horario), 0) horario, coalesce(sum(confirmou), 0) confirmou,
              coalesce(sum(compareceu), 0) compareceu
         FROM funil_diario WHERE data >= ?
     )
     SELECT cru.site + resumo.site                 AS site,
            cru.agendamento + resumo.agendamento   AS agendamento,
            cru.horario + resumo.horario           AS horario,
            cru.confirmou + resumo.confirmou       AS confirmou,
            cru.compareceu + resumo.compareceu     AS compareceu
       FROM cru, resumo`,
    desde, desde
  );
  return comTaxas(r, { dias, desde });
}

/**
 * As contagens viram passos com nome, perda e taxa.
 *
 * A conta mora aqui, e não na tela, porque a mesma resposta serve ao painel da
 * empresa e ao back-office — e duas implementações da mesma divisão divergem
 * no dia em que alguém mudar a regra de arredondamento.
 */
export function comTaxas(contagens, extra = {}) {
  const passos = [
    { chave: 'site', rotulo: 'Abriu o site' },
    { chave: 'agendamento', rotulo: 'Abriu o agendamento' },
    { chave: 'horario', rotulo: 'Escolheu o horário' },
    { chave: 'confirmou', rotulo: 'Confirmou' },
    { chave: 'compareceu', rotulo: 'Compareceu' },
  ].map(p => ({ ...p, total: Number(contagens?.[p.chave] || 0) }));

  const primeiro = passos[0].total;
  return {
    ...extra,
    passos: passos.map((p, i) => {
      const anterior = i === 0 ? null : passos[i - 1].total;
      return {
        ...p,
        // Do topo: quantos dos que abriram o site chegaram até aqui.
        doTopo: primeiro ? Math.round((p.total / primeiro) * 100) : null,
        // Do passo anterior: é onde o buraco aparece. Uma etapa que segura 95%
        // e outra que segura 30% contam histórias diferentes, e o número "do
        // topo" esconde isso.
        doAnterior: anterior ? Math.round((p.total / anterior) * 100) : null,
        perdidos: anterior == null ? null : anterior - p.total,
      };
    }),
    // Onde o buraco é maior, em gente perdida — não em porcentagem: perder
    // metade de dez é menos urgente que perder um quinto de mil.
    maiorQueda: maiorQueda(passos),
  };
}

function maiorQueda(passos) {
  let pior = null;
  for (let i = 1; i < passos.length; i++) {
    const perdidos = passos[i - 1].total - passos[i].total;
    if (perdidos > 0 && (!pior || perdidos > pior.perdidos)) {
      pior = { de: passos[i - 1].rotulo, para: passos[i].rotulo, perdidos };
    }
  }
  return pior;
}

/** 'YYYY-MM-DD' de N dias atrás. Texto, como toda data daqui. */
export function diasAtras(dias) {
  const d = new Date(`${hoje()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - Number(dias || 30));
  return d.toISOString().slice(0, 10);
}
