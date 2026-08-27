import { Router } from 'express';
import { db, uid, templateOut, messageOut, clientOut } from '../db.js';
import { hoje, agora, waLink } from '../lib/dates.js';
import { render, variaveis, VARIAVEIS } from '../lib/templates.js';
import { gerarFila, despachar } from '../jobs/mensagens.js';
import { enviar, modoManual } from '../whatsapp/index.js';

export const mensagens = Router();

/* ── Templates ── */
mensagens.get('/templates', (req, res) =>
  res.json({
    variaveis: VARIAVEIS,
    templates: db.prepare('SELECT * FROM templates ORDER BY tipo, titulo').all().map(templateOut),
  }));

mensagens.put('/templates/:id', (req, res) => {
  const atual = db.prepare('SELECT * FROM templates WHERE id=?').get(req.params.id);
  if (!atual) return res.status(404).json({ erro: 'template não encontrado' });
  const b = { ...templateOut(atual), ...req.body };
  db.prepare(
    `UPDATE templates SET titulo=?, quando=?, ativo=?, texto=?, meta_template_name=? WHERE id=?`
  ).run(b.titulo, b.quando, b.ativo ? 1 : 0, b.texto, b.metaTemplateName || '', req.params.id);
  res.json(templateOut(db.prepare('SELECT * FROM templates WHERE id=?').get(req.params.id)));
});

/* ── Fila ── */

/** Recalcula a fila sob demanda (o cron já faz isso a cada 10 min). */
mensagens.post('/fila/gerar', (req, res) => res.json({ novas: gerarFila() }));

mensagens.get('/fila', (req, res) => {
  const status = req.query.status || 'pendente';
  const rows = db.prepare(
    `SELECT m.*, c.nome AS cliente_nome, t.titulo AS template_titulo
       FROM messages m
       LEFT JOIN clients c   ON c.id = m.client_id
       LEFT JOIN templates t ON t.chave = m.template_chave
      WHERE m.status = ? ORDER BY m.agendado_para LIMIT 300`
  ).all(status);

  res.json({
    modoManual: modoManual(),
    itens: rows.map(r => ({
      ...messageOut(r),
      clienteNome: r.cliente_nome,
      titulo: r.template_titulo,
      // No modo manual é este link que o atendente clica.
      link: waLink(r.fone, r.texto),
    })),
  });
});

/** Marca como enviada. No modo manual é o atendente que confirma; com a API, o job. */
mensagens.post('/fila/:id/enviar', async (req, res) => {
  const m = db.prepare('SELECT * FROM messages WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ erro: 'mensagem não encontrada' });

  if (modoManual()) {
    db.prepare(`UPDATE messages SET status='enviado', enviado_em=?, provider='manual' WHERE id=?`)
      .run(`${hoje()} ${agora()}`, m.id);
    return res.json({ ok: true, manual: true, link: waLink(m.fone, m.texto) });
  }

  const t = db.prepare('SELECT * FROM templates WHERE chave=?').get(m.template_chave);
  const r = await enviar({ fone: m.fone, texto: m.texto, templateName: t?.meta_template_name || null });
  if (!r.ok) {
    db.prepare(`UPDATE messages SET status='erro', erro=? WHERE id=?`).run(r.erro, m.id);
    return res.status(502).json({ erro: r.erro });
  }
  db.prepare(`UPDATE messages SET status='enviado', enviado_em=?, provider=?, provider_id=? WHERE id=?`)
    .run(`${hoje()} ${agora()}`, 'meta', r.id || '', m.id);
  res.json({ ok: true });
});

mensagens.post('/fila/:id/pular', (req, res) => {
  db.prepare(`UPDATE messages SET status='pulado' WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

mensagens.post('/fila/despachar', async (req, res) => res.json(await despachar()));

/**
 * Campanhas: disparo manual para uma lista de clientes.
 * Respeita optin. Um envio por cliente por campanha por dia (dedupe).
 */
mensagens.post('/campanhas/:chave', (req, res) => {
  const t = db.prepare('SELECT * FROM templates WHERE chave=?').get(req.params.chave);
  if (!t) return res.status(404).json({ erro: 'campanha não encontrada' });

  const ids = req.body?.clienteIds;
  const alvo = ids?.length
    ? db.prepare(`SELECT * FROM clients WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids)
    : db.prepare('SELECT * FROM clients WHERE optin=1').all();

  const extra = req.body?.variaveis || {};   // ex.: { hora: '15:00' } na vaga de última hora
  const ins = db.prepare(
    `INSERT INTO messages (id,client_id,template_chave,fone,texto,status,agendado_para,dedupe_key,criado_em)
     VALUES (?,?,?,?,?,'pendente',?,?,?)`
  );

  let enfileiradas = 0, ignoradas = 0;
  for (const c of alvo) {
    if (!c.optin) { ignoradas++; continue; }
    const texto = render(t.texto, { ...variaveis({ cliente: c }), ...extra });
    try {
      ins.run(uid(), c.id, t.chave, c.fone, texto, `${hoje()} ${agora()}`,
              `${t.chave}:${c.id}:${hoje()}`, `${hoje()} ${agora()}`);
      enfileiradas++;
    } catch { ignoradas++; }
  }
  res.json({ enfileiradas, ignoradas, total: alvo.length });
});

/** Prévia de uma campanha para uma cliente específica, sem enfileirar nada. */
mensagens.post('/campanhas/:chave/previa', (req, res) => {
  const t = db.prepare('SELECT * FROM templates WHERE chave=?').get(req.params.chave);
  if (!t) return res.status(404).json({ erro: 'campanha não encontrada' });
  const c = db.prepare('SELECT * FROM clients WHERE id=?').get(req.body?.clienteId);
  if (!c) return res.status(404).json({ erro: 'cliente não encontrada' });
  res.json({ texto: render(t.texto, { ...variaveis({ cliente: c }), ...(req.body?.variaveis || {}) }) });
});
