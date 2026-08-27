import { Router } from 'express';
import { db, uid, clientOut, apptOut } from '../db.js';
import { hoje, soDigitos, diasEntre } from '../lib/dates.js';

export const clientes = Router();

/** Acrescenta o que o painel sempre quer junto: visitas, gasto e há quanto tempo sumiu. */
function comMetricas(c) {
  const m = db.prepare(
    `SELECT COUNT(*) visitas,
            SUM(CASE WHEN pag_status='pago' THEN valor ELSE 0 END) gasto,
            MAX(CASE WHEN data <= ? THEN data END) ultima,
            SUM(CASE WHEN status='falta' THEN 1 ELSE 0 END) faltas
       FROM appointments WHERE client_id=? AND status <> 'cancelado'`
  ).get(hoje(), c.id);
  return {
    ...c,
    visitas: m.visitas || 0,
    gasto: m.gasto || 0,
    faltas: m.faltas || 0,
    ultimaVisita: m.ultima || null,
    diasSemVir: m.ultima ? diasEntre(m.ultima, hoje()) : null,
  };
}

clientes.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  const rows = q
    ? db.prepare(`SELECT * FROM clients WHERE nome LIKE ? OR fone LIKE ? ORDER BY nome`)
        .all(`%${q}%`, `%${soDigitos(q)}%`)
    : db.prepare('SELECT * FROM clients ORDER BY nome').all();
  res.json(rows.map(r => comMetricas(clientOut(r))));
});

clientes.get('/:id', (req, res) => {
  const r = db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ erro: 'cliente não encontrada' });
  const historico = db.prepare(
    'SELECT * FROM appointments WHERE client_id=? ORDER BY data DESC, hora DESC'
  ).all(req.params.id).map(apptOut);
  res.json({ ...comMetricas(clientOut(r)), historico });
});

clientes.post('/', (req, res) => {
  const b = req.body || {};
  const fone = soDigitos(b.fone);
  if (!b.nome || fone.length < 10) {
    return res.status(400).json({ erro: 'nome e WhatsApp com DDD são obrigatórios' });
  }
  const existe = db.prepare('SELECT * FROM clients WHERE fone=?').get(fone);
  if (existe) return res.status(409).json({ erro: 'já existe cliente com esse WhatsApp', cliente: clientOut(existe) });

  const id = uid();
  db.prepare(
    `INSERT INTO clients (id,nome,fone,nascimento,endereco,obs,optin,criado_em) VALUES (?,?,?,?,?,?,?,?)`
  ).run(id, b.nome.trim(), fone, b.nascimento || null, b.endereco || '', b.obs || '',
        b.optin === false ? 0 : 1, hoje());
  res.status(201).json(comMetricas(clientOut(db.prepare('SELECT * FROM clients WHERE id=?').get(id))));
});

clientes.put('/:id', (req, res) => {
  const atual = db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id);
  if (!atual) return res.status(404).json({ erro: 'cliente não encontrada' });
  const b = { ...clientOut(atual), ...req.body };
  db.prepare(
    `UPDATE clients SET nome=?, fone=?, nascimento=?, endereco=?, obs=?, optin=? WHERE id=?`
  ).run(b.nome, soDigitos(b.fone), b.nascimento || null, b.endereco || '', b.obs || '',
        b.optin ? 1 : 0, req.params.id);
  res.json(comMetricas(clientOut(db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id))));
});

clientes.delete('/:id', (req, res) => {
  const usos = db.prepare('SELECT COUNT(*) n FROM appointments WHERE client_id=?').get(req.params.id).n;
  if (usos > 0) return res.status(409).json({ erro: `cliente tem ${usos} agendamentos; remova o histórico primeiro` });
  db.prepare('DELETE FROM clients WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});
