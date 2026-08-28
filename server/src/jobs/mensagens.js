import cron from 'node-cron';
import { db, uid, getConfig } from '../db.js';
import { hoje, agora, addDias, toMin, toHora, diasEntre } from '../lib/dates.js';
import { render, variaveis } from '../lib/templates.js';
import { enviar, modoManual } from '../whatsapp/index.js';
import { TENANT_PADRAO } from '../lib/tenant.js';

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

const tpl = chave => db.get('SELECT * FROM templates WHERE chave = ? AND ativo = 1', chave);
const cliente = id => db.get('SELECT * FROM clients WHERE id = ?', id);

async function enfileirar({ chave, cli, appt = null, quando, dedupe, exigeOptin = false }) {
  if (!cli || !cli.fone) return false;
  if (exigeOptin && !cli.optin) return false;          // LGPD: marketing só com consentimento
  const t = await tpl(chave);
  if (!t) return false;

  const texto = render(t.texto, await variaveis({ cliente: cli, agendamento: appt }));

  // ON CONFLICT em vez de try/catch em cima da mensagem do erro: "já está na
  // fila" é o caso normal de rodar gerarFila() de novo, não uma falha.
  const gravou = await db.run(
    `INSERT INTO messages (id, client_id, appointment_id, template_chave, fone, texto,
                           status, agendado_para, dedupe_key, criado_em)
     VALUES (?,?,?,?,?,?, 'pendente', ?, ?, ?)
     ON CONFLICT (dedupe_key) DO NOTHING`,
    uid(), cli.id, appt?.id || null, chave, cli.fone, texto, quando, dedupe,
    `${hoje()} ${agora()}`
  );
  return gravou > 0;
}

/** Enfileira a confirmação na hora do agendamento. Chamado pela rota de booking. */
export async function enfileirarConfirmacao(appt) {
  const cli = await cliente(appt.client_id);
  return enfileirar({
    chave: 'confirmacao', cli, appt,
    quando: `${hoje()} ${agora()}`,
    dedupe: `confirmacao:${appt.id}`,
  });
}

export async function gerarFila() {
  const h = hoje();
  const cfg = await getConfig();
  let n = 0;

  // Lembrete da véspera: para os agendamentos de amanhã ainda não confirmados.
  const amanha = addDias(h, 1);
  const deAmanha = await db.all(
    `SELECT * FROM appointments WHERE data = ? AND status IN ('agendado','confirmado')`, amanha
  );
  for (const a of deAmanha) {
    n += await enfileirar({
      chave: 'lembrete_vespera', cli: await cliente(a.client_id), appt: a,
      quando: `${h} ${cfg.horaLembreteVespera || '18:00'}`,
      dedupe: `lembrete_vespera:${a.id}`,
    }) ? 1 : 0;
  }

  // Aviso no dia: X horas antes do horário.
  const antes = (cfg.horasAvisoNoDia ?? 3) * 60;
  const deHoje = await db.all(
    `SELECT * FROM appointments WHERE data = ? AND status IN ('agendado','confirmado')`, h
  );
  for (const a of deHoje) {
    const quandoMin = toMin(a.hora) - antes;
    if (quandoMin < 0) continue;
    n += await enfileirar({
      chave: 'lembrete_dia', cli: await cliente(a.client_id), appt: a,
      quando: `${h} ${toHora(quandoMin)}`,
      dedupe: `lembrete_dia:${a.id}`,
    }) ? 1 : 0;
  }

  // Pós-atendimento: um dia depois de quem foi atendido.
  const ontem = await db.all(
    `SELECT * FROM appointments WHERE data = ? AND status = 'concluido'`, addDias(h, -1)
  );
  for (const a of ontem) {
    n += await enfileirar({
      chave: 'pos_atendimento', cli: await cliente(a.client_id), appt: a,
      quando: `${h} ${cfg.horaPosAtendimento || '11:00'}`,
      dedupe: `pos_atendimento:${a.id}`,
    }) ? 1 : 0;
  }

  // Aniversário: dispara N dias antes (padrão 7).
  const antecedencia = cfg.diasAntesAniversario ?? 7;
  const alvo = addDias(h, antecedencia).slice(5);       // 'MM-DD'
  const aniversariantes = await db.all(
    `SELECT * FROM clients WHERE nascimento IS NOT NULL AND substr(nascimento,6) = ?`, alvo
  );
  for (const c of aniversariantes) {
    n += await enfileirar({
      chave: 'aniversario', cli: c,
      quando: `${h} ${cfg.horaCampanha || '10:00'}`,
      dedupe: `aniversario:${c.id}:${h.slice(0, 4)}`,     // uma vez por ano
      exigeOptin: true,
    }) ? 1 : 0;
  }

  // Reativação: passou do prazo sem voltar.
  const prazo = cfg.diasReativacao ?? 60;
  const candidatas = await db.all(
    `SELECT c.*, MAX(a.data) AS ultima
       FROM clients c JOIN appointments a ON a.client_id = c.id
      WHERE a.status = 'concluido'
      GROUP BY c.id`
  );
  for (const c of candidatas) {
    const d = diasEntre(c.ultima, h);
    if (d < prazo || d > prazo + 60) continue;           // janela, pra não spammar quem sumiu de vez
    const ult = await db.get(
      `SELECT * FROM appointments WHERE client_id=? AND status='concluido' ORDER BY data DESC LIMIT 1`,
      c.id
    );
    n += await enfileirar({
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

  const vencidas = await db.all(
    `SELECT * FROM messages WHERE status = 'pendente' AND agendado_para <= ?
      ORDER BY agendado_para LIMIT ?`,
    `${hoje()} ${agora()}`, limite
  );

  let enviadas = 0, erros = 0;
  for (const m of vencidas) {
    const t = await db.get('SELECT * FROM templates WHERE chave = ?', m.template_chave);
    const r = await enviar({
      fone: m.fone,
      texto: m.texto,
      templateName: t?.meta_template_name || null,
    });
    if (r.ok) {
      await db.run(
        `UPDATE messages SET status='enviado', enviado_em=?, provider=?, provider_id=? WHERE id=?`,
        `${hoje()} ${agora()}`, 'meta', r.id || '', m.id
      );
      enviadas++;
    } else {
      await db.run(`UPDATE messages SET status='erro', erro=? WHERE id=?`, r.erro || 'falha', m.id);
      erros++;
    }
  }
  return { enviadas, erros };
}

/**
 * Roda uma rotina para cada empresa ativa, uma de cada vez.
 *
 * Cron não tem requisição, logo não tem empresa definida — e sem isso o RLS
 * não devolve nada. Cada empresa recebe a própria passada, com a conexão presa
 * a ela: uma empresa com erro não impede as outras de rodar.
 */
async function paraCadaEmpresa(nome, fn) {
  const empresas = await db.all(
    `SELECT id FROM plataforma.tenants WHERE ativo = 1 AND status = 'ativa' ORDER BY id`
  );
  for (const { id } of empresas) {
    try {
      await db.comEmpresa(id, fn);
    } catch (e) {
      console.error(`[${nome}] empresa ${id}:`, e.message);
    }
  }
}

/** Agendadores. Roda ao subir o servidor. */
export function iniciarJobs() {
  const tz = process.env.TZ_EMPRESA || process.env.TZ_ESTUDIO || 'America/Sao_Paulo';

  cron.schedule('*/10 * * * *', () => {
    paraCadaEmpresa('fila', gerarFila).catch(e => console.error('[fila]', e.message));
  }, { timezone: tz });

  cron.schedule('*/5 * * * *', () => {
    paraCadaEmpresa('despacho', despachar).catch(e => console.error('[despacho]', e.message));
  }, { timezone: tz });

  paraCadaEmpresa('fila inicial', gerarFila).catch(e => console.error('[fila inicial]', e.message));
  console.log(`[jobs] ativos · fuso ${tz} · provider ${process.env.WHATSAPP_PROVIDER || 'manual'}`);
}
