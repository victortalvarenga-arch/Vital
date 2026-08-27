import cron from 'node-cron';
import { db, uid, getConfig } from '../db.js';
import { hoje, agora, addDias, toMin, toHora, diasEntre } from '../lib/dates.js';
import { render, variaveis } from '../lib/templates.js';
import { enviar, modoManual } from '../whatsapp/index.js';

/**
 * Duas rotinas separadas, de propósito:
 *
 *  1. gerarFila()  — decide QUEM deve receber O QUÊ e QUANDO, e grava em `messages`.
 *  2. despachar()  — pega o que já venceu e entrega ao provider.
 *
 * A separação existe pra você conseguir revisar a fila antes de disparar
 * (e pra não perder mensagem se a API cair no meio).
 *
 * `dedupe_key` garante que rodar gerarFila() cem vezes no mesmo dia
 * não gere cem lembretes.
 */

const tpl = chave => db.prepare('SELECT * FROM templates WHERE chave = ? AND ativo = 1').get(chave);
const cliente = id => db.prepare('SELECT * FROM clients WHERE id = ?').get(id);

function enfileirar({ chave, cli, appt = null, quando, dedupe, exigeOptin = false }) {
  if (!cli || !cli.fone) return false;
  if (exigeOptin && !cli.optin) return false;          // LGPD: marketing só com consentimento
  const t = tpl(chave);
  if (!t) return false;

  const texto = render(t.texto, variaveis({ cliente: cli, agendamento: appt }));
  try {
    db.prepare(
      `INSERT INTO messages (id, client_id, appointment_id, template_chave, fone, texto,
                             status, agendado_para, dedupe_key, criado_em)
       VALUES (?,?,?,?,?,?, 'pendente', ?, ?, ?)`
    ).run(uid(), cli.id, appt?.id || null, chave, cli.fone, texto, quando, dedupe,
          `${hoje()} ${agora()}`);
    return true;
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return false;  // já estava na fila
    throw e;
  }
}

/** Enfileira a confirmação na hora do agendamento. Chamado pela rota de booking. */
export function enfileirarConfirmacao(appt) {
  const cli = cliente(appt.client_id);
  return enfileirar({
    chave: 'confirmacao', cli, appt,
    quando: `${hoje()} ${agora()}`,
    dedupe: `confirmacao:${appt.id}`,
  });
}

export function gerarFila() {
  const h = hoje();
  const cfg = getConfig();
  let n = 0;

  // Lembrete da véspera: para os agendamentos de amanhã ainda não confirmados.
  const amanha = addDias(h, 1);
  for (const a of db.prepare(
    `SELECT * FROM appointments WHERE data = ? AND status IN ('agendado','confirmado')`
  ).all(amanha)) {
    n += enfileirar({
      chave: 'lembrete_vespera', cli: cliente(a.client_id), appt: a,
      quando: `${h} ${cfg.horaLembreteVespera || '18:00'}`,
      dedupe: `lembrete_vespera:${a.id}`,
    }) ? 1 : 0;
  }

  // Aviso no dia: X horas antes do horário.
  const antes = (cfg.horasAvisoNoDia ?? 3) * 60;
  for (const a of db.prepare(
    `SELECT * FROM appointments WHERE data = ? AND status IN ('agendado','confirmado')`
  ).all(h)) {
    const quandoMin = toMin(a.hora) - antes;
    if (quandoMin < 0) continue;
    n += enfileirar({
      chave: 'lembrete_dia', cli: cliente(a.client_id), appt: a,
      quando: `${h} ${toHora(quandoMin)}`,
      dedupe: `lembrete_dia:${a.id}`,
    }) ? 1 : 0;
  }

  // Pós-atendimento: um dia depois de quem foi atendido.
  for (const a of db.prepare(
    `SELECT * FROM appointments WHERE data = ? AND status = 'concluido'`
  ).all(addDias(h, -1))) {
    n += enfileirar({
      chave: 'pos_atendimento', cli: cliente(a.client_id), appt: a,
      quando: `${h} ${cfg.horaPosAtendimento || '11:00'}`,
      dedupe: `pos_atendimento:${a.id}`,
    }) ? 1 : 0;
  }

  // Aniversário: dispara N dias antes (padrão 7).
  const antecedencia = cfg.diasAntesAniversario ?? 7;
  const alvo = addDias(h, antecedencia).slice(5);       // 'MM-DD'
  for (const c of db.prepare(
    `SELECT * FROM clients WHERE nascimento IS NOT NULL AND substr(nascimento,6) = ?`
  ).all(alvo)) {
    n += enfileirar({
      chave: 'aniversario', cli: c,
      quando: `${h} ${cfg.horaCampanha || '10:00'}`,
      dedupe: `aniversario:${c.id}:${h.slice(0, 4)}`,     // uma vez por ano
      exigeOptin: true,
    }) ? 1 : 0;
  }

  // Reativação: passou do prazo sem voltar.
  const prazo = cfg.diasReativacao ?? 60;
  const candidatas = db.prepare(
    `SELECT c.*, MAX(a.data) AS ultima
       FROM clients c JOIN appointments a ON a.client_id = c.id
      WHERE a.status = 'concluido'
      GROUP BY c.id`
  ).all();
  for (const c of candidatas) {
    const d = diasEntre(c.ultima, h);
    if (d < prazo || d > prazo + 60) continue;           // janela, pra não spammar quem sumiu de vez
    const ult = db.prepare(
      `SELECT * FROM appointments WHERE client_id=? AND status='concluido' ORDER BY data DESC LIMIT 1`
    ).get(c.id);
    n += enfileirar({
      chave: 'reativacao', cli: c, appt: ult,
      quando: `${h} ${cfg.horaCampanha || '10:00'}`,
      dedupe: `reativacao:${c.id}:${c.ultima}`,
      exigeOptin: true,
    }) ? 1 : 0;
  }

  return n;
}

/** Entrega o que já venceu. No modo manual não envia nada: só deixa na fila. */
export async function despachar({ limite = 30 } = {}) {
  if (modoManual()) return { enviadas: 0, modo: 'manual' };

  const vencidas = db.prepare(
    `SELECT * FROM messages WHERE status = 'pendente' AND agendado_para <= ?
      ORDER BY agendado_para LIMIT ?`
  ).all(`${hoje()} ${agora()}`, limite);

  let enviadas = 0, erros = 0;
  for (const m of vencidas) {
    const t = db.prepare('SELECT * FROM templates WHERE chave = ?').get(m.template_chave);
    const r = await enviar({
      fone: m.fone,
      texto: m.texto,
      templateName: t?.meta_template_name || null,
    });
    if (r.ok) {
      db.prepare(`UPDATE messages SET status='enviado', enviado_em=?, provider=?, provider_id=? WHERE id=?`)
        .run(`${hoje()} ${agora()}`, 'meta', r.id || '', m.id);
      enviadas++;
    } else {
      db.prepare(`UPDATE messages SET status='erro', erro=? WHERE id=?`).run(r.erro || 'falha', m.id);
      erros++;
    }
  }
  return { enviadas, erros };
}

/** Agendadores. Roda ao subir o servidor. */
export function iniciarJobs() {
  const tz = process.env.TZ_ESTUDIO || 'America/Sao_Paulo';

  cron.schedule('*/10 * * * *', () => {
    try { gerarFila(); } catch (e) { console.error('[fila]', e.message); }
  }, { timezone: tz });

  cron.schedule('*/5 * * * *', () => {
    despachar().catch(e => console.error('[despacho]', e.message));
  }, { timezone: tz });

  try { gerarFila(); } catch (e) { console.error('[fila inicial]', e.message); }
  console.log(`[jobs] ativos · fuso ${tz} · provider ${process.env.WHATSAPP_PROVIDER || 'manual'}`);
}
