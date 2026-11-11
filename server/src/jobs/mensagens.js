import cron from 'node-cron';
import { db, uid, getConfig } from '../db.js';
import { hoje, agora, addDias, toMin, toHora } from '../lib/dates.js';
import { render, variaveis } from '../lib/templates.js';
import { enviar, modoManual } from '../whatsapp/index.js';
import { fecharAtendimentos } from './fechamento.js';
import { compactarFunil } from './funil.js';
import { podarRegistro } from './registro.js';
import { estenderSeries } from './bloqueios.js';
import { sincronizarTodas } from '../conexoes/index.js';
import { tentarLideranca } from '../lib/lideranca.js';

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
 *
 * Toda mensagem nasce com `expira_em`, decidido aqui por quem sabe o que ela
 * promete; `expirarFila()` tira da fila o que venceu sem sair.
 */

const tpl = chave => db.get('SELECT * FROM templates WHERE chave = ? AND ativo = 1', chave);
const cliente = id => db.get('SELECT * FROM clients WHERE id = ?', id);

const agoraTexto = () => `${hoje()} ${agora()}`;
const fimDoDia = data => `${data} 23:59`;
/** Lembrete do horário só serve até o horário. */
const aoComecar = a => `${a.data} ${a.hora}`;

/** Até quando "como foi?" e campanha ainda fazem sentido. */
const DIAS_DE_VALIDADE = 7;

const POS_ATENDIMENTO = ['pos_atendimento', 'pos_cuidado'];

/**
 * Prazo de uma campanha colocada na fila hoje. Quem fala de um horário (a vaga
 * de última hora) vale até ele; as outras, uma semana.
 */
export const expiraCampanha = (chave, horario = null) => horario
  || fimDoDia(chave === 'vaga' ? hoje() : addDias(hoje(), DIAS_DE_VALIDADE));

async function enfileirar({ chave, cli, appt = null, quando, expira, dedupe, exigeOptin = false }) {
  if (!cli || !cli.fone) return false;
  if (exigeOptin && !cli.optin) return false;          // LGPD: marketing só com consentimento
  // Lançamento retroativo, ou serviço fora do ar: já nasceria vencida.
  if (expira <= agoraTexto()) return false;
  const t = await tpl(chave);
  if (!t) return false;

  const texto = render(t.texto, await variaveis({ cliente: cli, agendamento: appt }));

  // ON CONFLICT em vez de try/catch em cima da mensagem do erro: "já está na
  // fila" é o caso normal de rodar gerarFila() de novo, não uma falha.
  const gravou = await db.run(
    `INSERT INTO messages (id, client_id, appointment_id, template_chave, fone, texto,
                           status, agendado_para, expira_em, dedupe_key, criado_em)
     VALUES (?,?,?,?,?,?, 'pendente', ?, ?, ?, ?)
     ON CONFLICT ON CONSTRAINT messages_dedupe_por_empresa DO NOTHING`,
    uid(), cli.id, appt?.id || null, chave, cli.fone, texto, quando, expira, dedupe,
    agoraTexto()
  );
  return gravou > 0;
}

/**
 * Tira da fila o que passou do prazo sem sair. Não apaga: a `dedupe_key` da
 * linha é o que impede `gerarFila` de criar a mesma mensagem de novo.
 *
 * Roda antes de toda leitura da fila e de todo despacho, e não só no cron: o
 * cron demora até dez minutos, e nesse intervalo um lembrete de horário que já
 * passou sairia para a cliente.
 */
export function expirarFila() {
  return db.run(
    `UPDATE messages SET status = 'expirado' WHERE status = 'pendente' AND expira_em <= ?`,
    agoraTexto()
  );
}

/** Enfileira a confirmação na hora do agendamento. Chamado pela rota de booking. */
export async function enfileirarConfirmacao(appt) {
  const cli = await cliente(appt.client_id);
  return enfileirar({
    chave: 'confirmacao', cli, appt,
    quando: agoraTexto(),
    expira: aoComecar(appt),
    dedupe: `confirmacao:${appt.id}`,
  });
}

/**
 * Avisa a cliente do novo horário. A rota já apagou o que estava pendente; o que
 * já saiu perde a `dedupe_key`, senão véspera e aviso no dia do horário novo
 * dariam com a chave do antigo e nunca sairiam.
 *
 * O minuto entra no dedupe porque voltar ao horário de antes é outra remarcação.
 */
export async function enfileirarRemarcacao(appt) {
  await db.run(
    `UPDATE messages SET dedupe_key = NULL
      WHERE appointment_id = ? AND template_chave IN ('lembrete_vespera', 'lembrete_dia')`,
    appt.id
  );
  if (!['agendado', 'confirmado'].includes(appt.status)) return false;
  return enfileirar({
    chave: 'remarcacao', cli: await cliente(appt.client_id), appt,
    quando: agoraTexto(),
    expira: aoComecar(appt),
    dedupe: `remarcacao:${appt.id}:${appt.data}:${appt.hora}:${agoraTexto()}`,
  });
}

/**
 * Uma mensagem por cliente por semana, não uma por atendimento: quem veio duas
 * vezes recebe uma pergunta geral, que entra no lugar do que ainda não saiu. Quem
 * já recebeu nesta semana não recebe outra, mesmo voltando depois.
 */
async function enfileirarPosAtendimento(clienteId, atendimentos, quando) {
  const marcadores = POS_ATENDIMENTO.map(() => '?').join(',');
  const feitas = await db.all(
    `SELECT status, template_chave FROM messages
      WHERE client_id = ? AND template_chave IN (${marcadores})
        AND status IN ('pendente', 'enviado') AND criado_em >= ?`,
    clienteId, ...POS_ATENDIMENTO, addDias(hoje(), -DIAS_DE_VALIDADE)
  );
  if (feitas.some(m => m.status === 'enviado')) return false;

  const ultimo = atendimentos.at(-1);
  const base = {
    cli: await cliente(clienteId), appt: ultimo, quando,
    expira: fimDoDia(addDias(ultimo.data, DIAS_DE_VALIDADE)),
  };
  if (atendimentos.length === 1) {
    // Sobra de quando eram dois: o mais antigo saiu da janela, e a pergunta
    // geral que está na fila já cobre este.
    if (feitas.some(m => m.template_chave === 'pos_cuidado')) return false;
    return enfileirar({ ...base, chave: 'pos_atendimento', dedupe: `pos_atendimento:${ultimo.id}` });
  }

  const dedupe = `pos_cuidado:${ultimo.id}`;
  const gravou = await enfileirar({ ...base, chave: 'pos_cuidado', dedupe });
  if (gravou) {
    await db.run(
      `DELETE FROM messages
        WHERE client_id = ? AND status = 'pendente' AND template_chave IN (${marcadores})
          AND dedupe_key <> ?`,
      clienteId, ...POS_ATENDIMENTO, dedupe
    );
  }
  return gravou;
}

export async function gerarFila() {
  await expirarFila();
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
      expira: aoComecar(a),
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
      expira: aoComecar(a),
      dedupe: `lembrete_dia:${a.id}`,
    }) ? 1 : 0;
  }

  // Pós-atendimento: depois de quem foi atendido. Desde a 034, o atendimento
  // só vira concluído quando alguém confirma que a cliente veio — e isso pode
  // acontecer dias depois, pelo aviso de pendências. Olhar só "ontem" deixaria
  // sem mensagem quem foi confirmada na quinta pelo atendimento de segunda.
  // Uma semana é o limite em que "como foi?" ainda faz sentido.
  const daSemana = await db.all(
    `SELECT * FROM appointments WHERE data >= ? AND data <= ? AND status = 'concluido'
      ORDER BY data, hora`,
    addDias(h, -DIAS_DE_VALIDADE), addDias(h, -1)
  );
  const porCliente = new Map();
  for (const a of daSemana) {
    porCliente.set(a.client_id, [...(porCliente.get(a.client_id) || []), a]);
  }
  for (const [clienteId, atendimentos] of porCliente) {
    n += await enfileirarPosAtendimento(clienteId, atendimentos,
      `${h} ${cfg.horaPosAtendimento || '11:00'}`) ? 1 : 0;
  }

  // Aniversário: dispara N dias antes (padrão 7).
  const antecedencia = cfg.diasAntesAniversario ?? 7;
  const dataDoAniversario = addDias(h, antecedencia);
  const alvo = dataDoAniversario.slice(5);              // 'MM-DD'
  const aniversariantes = await db.all(
    `SELECT * FROM clients WHERE nascimento IS NOT NULL AND substr(nascimento,6) = ?`, alvo
  );
  for (const c of aniversariantes) {
    n += await enfileirar({
      chave: 'aniversario', cli: c,
      quando: `${h} ${cfg.horaCampanha || '10:00'}`,
      expira: fimDoDia(dataDoAniversario),
      dedupe: `aniversario:${c.id}:${h.slice(0, 4)}`,     // uma vez por ano
      exigeOptin: true,
    }) ? 1 : 0;
  }

  // Reativação não passa por aqui: quem faz tempo que não volta está na aba
  // Recuperação, e mandar mensagem é escolha de quem olha (migration 036).
  return n;
}

/** Entrega o que já venceu. No modo manual não envia nada: só deixa na fila. */
export async function despachar({ limite = 30 } = {}) {
  await expirarFila();
  if (await modoManual()) return { enviadas: 0, modo: 'manual' };

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
export async function paraCadaEmpresa(nome, fn) {
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

/**
 * Liga os jobs — mas só no processo que ganhar a trava (`lib/lideranca.js`).
 *
 * Com uma cópia só de pé, ela ganha na hora e nada muda. Com duas (API em
 * duas máquinas, ou API mais o processo `npm run jobs`), uma roda e a outra
 * fica de reserva, tentando de minuto em minuto: se a que roda cair, a reserva
 * assume sem ninguém mexer em nada.
 */
export function iniciarJobs() {
  let tarefas = [];
  let lideranca = null;
  let avisouReserva = false;

  const tentar = async () => {
    if (lideranca) return;
    try {
      const r = await tentarLideranca({
        aoPerder: () => { tarefas.forEach(t => t.stop()); tarefas = []; lideranca = null; },
      });
      if (!r.lider) {
        if (!avisouReserva) console.log('[jobs] outro processo roda os jobs; este fica de reserva');
        avisouReserva = true;
        return;
      }
      lideranca = r;
      tarefas = agendar();
    } catch (erro) {
      console.error('[jobs] não consegui disputar a trava:', erro.message);
    }
  };

  tentar();
  setInterval(tentar, 60_000).unref();
}

/** Os agendadores em si. Devolve as tarefas, para parar se a trava cair. */
function agendar() {
  const tz = process.env.TZ_EMPRESA || process.env.TZ_ESTUDIO || 'America/Sao_Paulo';
  const tarefas = [];
  const agendarCada = (quando, fn) => tarefas.push(cron.schedule(quando, fn, { timezone: tz }));

  agendarCada('*/10 * * * *', () => {
    paraCadaEmpresa('fila', gerarFila).catch(e => console.error('[fila]', e.message));
  });

  agendarCada('*/5 * * * *', () => {
    paraCadaEmpresa('despacho', despachar).catch(e => console.error('[despacho]', e.message));
  });

  // Fechamento: de 5 em 5 minutos o que já terminou vira atendimento feito.
  // Frequente de propósito — "passou a hora, entrou no caixa" precisa valer
  // durante o dia, não só no fim dele, senão o Resumo do balcão fica velho.
  agendarCada('*/5 * * * *', () => {
    paraCadaEmpresa('fechamento', fecharAtendimentos).catch(e => console.error('[fechamento]', e.message));
  });

  // Compactar o funil: uma vez por dia, de madrugada. Não precisa de
  // `paraCadaEmpresa` — a função do banco atravessa o RLS e fecha todas as
  // empresas numa transação só. Às 4h17 e não às 4h em ponto, para não
  // disputar a janela com backup e outros jobs de hora redonda.
  agendarCada('17 4 * * *', () => {
    compactarFunil().catch(e => console.error('[funil]', e.message));
  });
  // O registro do painel guarda dois anos (migration 027). Dez minutos depois
  // do funil, para as duas podas não disputarem o banco.
  agendarCada('27 4 * * *', () => {
    podarRegistro().catch(e => console.error('[registro]', e.message));
  });
  // Bloqueio que "nunca termina" ganha as datas que faltam para 12 meses à
  // frente (migration 028). Uma vez por dia basta: o horizonte é de um ano.
  agendarCada('37 4 * * *', () => {
    paraCadaEmpresa('bloqueios', estenderSeries).catch(e => console.error('[bloqueios]', e.message));
  });

  // Avaliações do Google e publicações do Instagram, de hora em hora — no
  // minuto 23 para não cair junto dos outros. Mais que isso não muda nada no
  // site (avaliação nova é coisa de dias) e gasta cota dos provedores. Só
  // passa por empresa que tem conexão: as outras são um SELECT vazio.
  agendarCada('23 * * * *', () => {
    paraCadaEmpresa('conexoes', sincronizarTodas).catch(e => console.error('[conexoes]', e.message));
  });

  // Uma passada ao subir, como a fila. Sem isto, todo reinício deixa o caixa
  // parado até o próximo tique — e um deploy no meio da tarde faria o balcão
  // olhar para número velho sem entender por quê.
  paraCadaEmpresa('fechamento inicial', fecharAtendimentos)
    .catch(e => console.error('[fechamento inicial]', e.message));
  paraCadaEmpresa('fila inicial', gerarFila).catch(e => console.error('[fila inicial]', e.message));
  console.log(`[jobs] ativos neste processo · fuso ${tz}`);
  return tarefas;
}
