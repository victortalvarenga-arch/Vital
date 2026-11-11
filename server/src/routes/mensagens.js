import { Router } from 'express';
import { db, uid, getConfig, setConfig, templateOut, messageOut } from '../db.js';
import { hoje, agora, addDias, diasEntre, fmtData, waLink } from '../lib/dates.js';
import { render, variaveis, VARIAVEIS } from '../lib/templates.js';
import { gerarFila, despachar, expirarFila, expiraCampanha } from '../jobs/mensagens.js';
import { enviar, modoManual } from '../whatsapp/index.js';
import { rota } from '../lib/rota.js';
import { escopoDe, exige } from '../lib/auth.js';

export const mensagens = Router();

/* ── Templates ── */
mensagens.get('/templates', rota(async (req, res) => {
  const rows = await db.all('SELECT * FROM templates ORDER BY tipo, titulo');
  res.json({ variaveis: VARIAVEIS, templates: rows.map(templateOut) });
}));

mensagens.put('/templates/:id', exige('clientes'), rota(async (req, res) => {
  const atual = await db.get('SELECT * FROM templates WHERE id=?', req.params.id);
  if (!atual) return res.status(404).json({ erro: 'template não encontrado' });
  const b = { ...templateOut(atual), ...req.body };
  await db.run(
    `UPDATE templates SET titulo=?, quando=?, ativo=?, texto=?, meta_template_name=? WHERE id=?`,
    b.titulo, b.quando, b.ativo ? 1 : 0, b.texto, b.metaTemplateName || '', req.params.id
  );
  res.json(templateOut(await db.get('SELECT * FROM templates WHERE id=?', req.params.id)));
}));

/* ── Fila ── *
 *
 * **A fila é recortada por papel, como a agenda** (2026-11-02). Cada lembrete
 * traz nome, telefone e o texto com horário e serviço, e saía inteiro para
 * qualquer pessoa logada: a profissional via — e marcava como enviado — o
 * lembrete da cliente da colega, que a agenda dela não mostra. Quem tem escopo
 * fica só com as mensagens de atendimentos dela; mensagem sem atendimento
 * (campanha) é da empresa, e só quem vê todas a recebe.
 *
 * Campanhas e o texto das automações valem para a empresa inteira: ficam com
 * quem cuida das clientes (`clientes`: dona e recepção).
 */

/**
 * Atendimento `pendente` conta como visita: passou da hora e ninguém marcou,
 * mas quase sempre ela veio. Falta não conta.
 */
const FOI_ATENDIDA = `status IN ('concluido', 'pendente')`;

/**
 * A última visita de cada cliente, para situar quem olha a fila. Vem recortada
 * como a agenda: a profissional vê a última visita com ela, não o que a cliente
 * fez com a colega.
 */
async function ultimasVisitas(clienteIds, so) {
  if (!clienteIds.length) return new Map();
  const rows = await db.all(
    `SELECT DISTINCT ON (a.client_id) a.client_id, a.data, s.nome AS servico, p.nome AS profissional
       FROM appointments a
       LEFT JOIN services s ON s.id = a.service_id
       LEFT JOIN staff p    ON p.id = a.staff_id
      WHERE a.client_id = ANY(?) AND a.${FOI_ATENDIDA} ${so ? 'AND a.staff_id = ?' : ''}
      ORDER BY a.client_id, a.data DESC, a.hora DESC`,
    clienteIds, ...(so ? [so] : [])
  );
  return new Map(rows.map(r => [r.client_id, {
    data: r.data, servico: r.servico, profissional: (r.profissional || '').split(' ')[0],
  }]));
}

/** A mensagem, se esta pessoa pode mexer nela; `null` se não existe ou não é dela. */
async function mensagemDe(usuario, id) {
  const so = escopoDe(usuario);
  return so
    ? db.get(
        `SELECT m.* FROM messages m JOIN appointments a ON a.id = m.appointment_id
          WHERE m.id = ? AND a.staff_id = ?`, id, so)
    : db.get('SELECT * FROM messages WHERE id=?', id);
}

/** Recalcula a fila sob demanda (o cron já faz isso a cada 10 min). */
mensagens.post('/fila/gerar', rota(async (req, res) => res.json({ novas: await gerarFila() })));

mensagens.get('/fila', rota(async (req, res) => {
  await expirarFila();
  const status = req.query.status || 'pendente';
  const so = escopoDe(req.usuario);
  const rows = await db.all(
    `SELECT m.*, c.nome AS cliente_nome, t.titulo AS template_titulo
       FROM messages m
       LEFT JOIN clients c   ON c.id = m.client_id
       LEFT JOIN templates t ON t.chave = m.template_chave
       ${so ? 'JOIN appointments a ON a.id = m.appointment_id AND a.staff_id = ?' : ''}
      WHERE m.status = ? ORDER BY m.agendado_para LIMIT 300`,
    ...(so ? [so] : []), status
  );
  const visitas = await ultimasVisitas([...new Set(rows.map(r => r.client_id).filter(Boolean))], so);

  res.json({
    modoManual: await modoManual(),
    itens: rows.map(r => ({
      ...messageOut(r),
      clienteNome: r.cliente_nome,
      titulo: r.template_titulo,
      ultimaVisita: visitas.get(r.client_id) || null,
      // No modo manual é este link que o atendente clica.
      link: waLink(r.fone, r.texto),
    })),
  });
}));

/** Marca como enviada. No modo manual é o atendente que confirma; com a API, o job. */
mensagens.post('/fila/:id/enviar', rota(async (req, res) => {
  // 404 e não 403 para a mensagem de outra: id circula, e "existe mas não é
  // sua" já diria que aquela cliente tem horário marcado.
  await expirarFila();
  const m = await mensagemDe(req.usuario, req.params.id);
  if (!m) return res.status(404).json({ erro: 'mensagem não encontrada' });
  // O painel pode estar aberto desde antes de a mensagem vencer.
  if (m.status === 'expirado') return res.status(409).json({ erro: 'essa mensagem já passou do prazo' });

  if (await modoManual()) {
    await db.run(
      `UPDATE messages SET status='enviado', enviado_em=?, provider='manual' WHERE id=?`,
      `${hoje()} ${agora()}`, m.id
    );
    return res.json({ ok: true, manual: true, link: waLink(m.fone, m.texto) });
  }

  const t = await db.get('SELECT * FROM templates WHERE chave=?', m.template_chave);
  const r = await enviar({ fone: m.fone, texto: m.texto, templateName: t?.meta_template_name || null });
  if (!r.ok) {
    await db.run(`UPDATE messages SET status='erro', erro=? WHERE id=?`, r.erro, m.id);
    return res.status(502).json({ erro: r.erro });
  }
  await db.run(
    `UPDATE messages SET status='enviado', enviado_em=?, provider=?, provider_id=? WHERE id=?`,
    `${hoje()} ${agora()}`, 'meta', r.id || '', m.id
  );
  res.json({ ok: true });
}));

mensagens.post('/fila/:id/pular', rota(async (req, res) => {
  const m = await mensagemDe(req.usuario, req.params.id);
  if (!m) return res.status(404).json({ erro: 'mensagem não encontrada' });
  await db.run(`UPDATE messages SET status='pulado' WHERE id=?`, m.id);
  res.json({ ok: true });
}));

mensagens.post('/fila/despachar', exige('verDeTodos'), rota(async (req, res) => res.json(await despachar())));

/* ── Recuperação ── *
 *
 * Quem faz tempo que não volta. É uma lista para olhar, não tarefa: nada entra
 * na fila e nada sai sozinho (migration 036). Vale para a empresa inteira, então
 * fica com quem cuida das clientes, como campanhas.
 */
mensagens.get('/recuperacao', exige('clientes'), rota(async (req, res) => {
  const prazo = (await getConfig()).diasReativacao ?? 60;
  const h = hoje();
  // Quem saiu há menos tempo vem primeiro: é quem ainda volta com uma mensagem.
  // O teto segura uma base enorme; quem fica de fora é quem sumiu há mais tempo.
  const rows = await db.all(
    `WITH visitas AS (
       SELECT client_id, MAX(data) AS ultima, COUNT(*) AS total
         FROM appointments WHERE ${FOI_ATENDIDA} GROUP BY client_id
     )
     SELECT c.id, c.nome, c.fone, c.optin, v.ultima, v.total,
            (SELECT s.nome FROM appointments a JOIN services s ON s.id = a.service_id
              WHERE a.client_id = c.id AND a.${FOI_ATENDIDA}
              ORDER BY a.data DESC, a.hora DESC LIMIT 1) AS ultimo_servico,
            (SELECT MAX(m.enviado_em) FROM messages m
              WHERE m.client_id = c.id AND m.template_chave = 'reativacao'
                AND m.status = 'enviado' AND m.enviado_em >= v.ultima) AS chamada_em
       FROM clients c JOIN visitas v ON v.client_id = c.id
      WHERE v.ultima <= ?
        AND NOT EXISTS (
          SELECT 1 FROM appointments f WHERE f.client_id = c.id
             AND f.status IN ('agendado', 'confirmado', 'em_atendimento')
        )
      ORDER BY v.ultima DESC LIMIT 500`,
    addDias(h, -prazo)
  );

  res.json({
    prazo,
    itens: rows.map(r => ({
      id: r.id, nome: r.nome, fone: r.fone, optin: !!r.optin,
      ultimaVisita: r.ultima, dias: diasEntre(r.ultima, h), visitas: Number(r.total),
      ultimoServico: r.ultimo_servico, chamadaEm: r.chamada_em || null,
    })),
  });
}));

/**
 * Quantos dias sem voltar contam. Rota própria e não `PUT /config`: quem cuida
 * das clientes inclui a recepção, e a configuração da empresa é só da dona. Só
 * muda o recorte de uma lista, nada sai para ninguém.
 */
mensagens.put('/recuperacao/prazo', exige('clientes'), rota(async (req, res) => {
  const dias = Number(req.body?.dias);
  if (!Number.isInteger(dias) || dias < 7 || dias > 730) {
    return res.status(400).json({ erro: 'use um número de 7 a 730 dias' });
  }
  await setConfig({ diasReativacao: dias });
  await req.registrar('config.alterada', {
    alvoId: 'config',
    resumo: `mudou a recuperação para ${dias} dias sem voltar`,
    detalhe: { diasReativacao: dias },
  });
  res.json({ prazo: dias });
}));

/** Toque em "Chamar": uma cliente, uma mensagem, por decisão de quem tocou. */
mensagens.post('/recuperacao/:id/enviar', exige('clientes'), rota(async (req, res) => {
  const c = await db.get('SELECT * FROM clients WHERE id=?', req.params.id);
  if (!c) return res.status(404).json({ erro: 'cliente não encontrada' });
  if (!c.fone) return res.status(409).json({ erro: 'cliente sem telefone' });
  // É marketing, mesmo com alguém apertando o botão: LGPD não muda com o gatilho.
  if (!c.optin) return res.status(409).json({ erro: 'cliente não autorizou receber mensagens' });

  const t = await db.get(`SELECT * FROM templates WHERE chave='reativacao'`);
  if (!t) return res.status(404).json({ erro: 'mensagem não encontrada' });

  const ult = await db.get(
    `SELECT * FROM appointments WHERE client_id=? AND ${FOI_ATENDIDA}
      ORDER BY data DESC, hora DESC LIMIT 1`, c.id
  );
  const h = hoje();
  const texto = render(t.texto, {
    ...(await variaveis({ cliente: c, agendamento: ult })),
    // `variaveis` conta só o concluído; aqui vale a mesma última visita da lista.
    ...(ult ? { dias: String(diasEntre(ult.data, h)) } : {}),
  });

  const dedupe = `reativacao:${c.id}:${h}`;
  const gravar = (provider, providerId = '') => db.run(
    `INSERT INTO messages (id,client_id,template_chave,fone,texto,status,agendado_para,enviado_em,
                           provider,provider_id,dedupe_key,criado_em)
     VALUES (?,?,?,?,?,'enviado',?,?,?,?,?,?)
     ON CONFLICT ON CONSTRAINT messages_dedupe_por_empresa DO NOTHING`,
    uid(), c.id, t.chave, c.fone, texto, `${h} ${agora()}`, `${h} ${agora()}`,
    provider, providerId, dedupe, `${h} ${agora()}`
  );

  // No manual, tocar de novo só reabre o link: quem envia é a pessoa, no celular.
  if (await modoManual()) {
    await gravar('manual');
    return res.json({ ok: true, manual: true, link: waLink(c.fone, texto) });
  }

  if (await db.get('SELECT 1 FROM messages WHERE dedupe_key=?', dedupe)) {
    return res.status(409).json({ erro: 'essa cliente já recebeu a mensagem hoje' });
  }
  const r = await enviar({ fone: c.fone, texto, templateName: t.meta_template_name || null });
  if (!r.ok) return res.status(502).json({ erro: r.erro });
  await gravar('meta', r.id || '');
  res.json({ ok: true });
}));

/**
 * O dia e a hora de uma campanha que fala de um horário, como a vaga de última
 * hora. Sem isto `{hora}` saía em branco ("abriu uma vaga hoje às 🙌"): o texto é
 * da empresa, então quem decide se os dois são obrigatórios é o próprio texto.
 */
function horarioDaCampanha(texto, { data, hora } = {}) {
  if (!/\{(data|hora)\}/.test(texto)) return {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '') || !/^\d{2}:\d{2}$/.test(hora || '')) {
    return { erro: 'informe o dia e o horário' };
  }
  const horario = `${data} ${hora}`;
  if (horario <= `${hoje()} ${agora()}`) return { erro: 'esse horário já passou' };
  return { horario, vars: { data: fmtData(data), hora } };
}

/**
 * Campanhas: disparo manual para uma lista de clientes.
 * Respeita optin. Um envio por cliente por campanha por dia (dedupe).
 */
mensagens.post('/campanhas/:chave', exige('clientes'), rota(async (req, res) => {
  const t = await db.get('SELECT * FROM templates WHERE chave=?', req.params.chave);
  if (!t) return res.status(404).json({ erro: 'campanha não encontrada' });

  const { erro, horario, vars } = horarioDaCampanha(t.texto, req.body?.variaveis);
  if (erro) return res.status(400).json({ erro });

  const ids = req.body?.clienteIds;
  const alvo = ids?.length
    ? await db.all(`SELECT * FROM clients WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids)
    : await db.all('SELECT * FROM clients WHERE optin=1');

  const extra = { ...(req.body?.variaveis || {}), ...vars };   // ex.: o dia e a hora da vaga

  let enfileiradas = 0, ignoradas = 0;
  for (const c of alvo) {
    if (!c.optin) { ignoradas++; continue; }
    const texto = render(t.texto, { ...(await variaveis({ cliente: c })), ...extra });
    // ON CONFLICT em vez de try/catch: repetir a mesma campanha para a mesma
    // cliente no mesmo dia é caso esperado, não erro.
    const gravou = await db.run(
      `INSERT INTO messages (id,client_id,template_chave,fone,texto,status,agendado_para,expira_em,dedupe_key,criado_em)
       VALUES (?,?,?,?,?,'pendente',?,?,?,?)
       ON CONFLICT ON CONSTRAINT messages_dedupe_por_empresa DO NOTHING`,
      uid(), c.id, t.chave, c.fone, texto, `${hoje()} ${agora()}`, expiraCampanha(t.chave, horario),
      `${t.chave}:${c.id}:${hoje()}`, `${hoje()} ${agora()}`
    );
    if (gravou) enfileiradas++; else ignoradas++;
  }
  res.json({ enfileiradas, ignoradas, total: alvo.length });
}));

/** Prévia de uma campanha para uma cliente específica, sem enfileirar nada. */
mensagens.post('/campanhas/:chave/previa', exige('clientes'), rota(async (req, res) => {
  const t = await db.get('SELECT * FROM templates WHERE chave=?', req.params.chave);
  if (!t) return res.status(404).json({ erro: 'campanha não encontrada' });
  const c = await db.get('SELECT * FROM clients WHERE id=?', req.body?.clienteId);
  if (!c) return res.status(404).json({ erro: 'cliente não encontrada' });
  res.json({ texto: render(t.texto, { ...(await variaveis({ cliente: c })), ...(req.body?.variaveis || {}) }) });
}));
