import { Router } from 'express';
import { db, uid, clientOut, apptOut } from '../db.js';
import { hoje, soDigitos, diasEntre } from '../lib/dates.js';
import { rota } from '../lib/rota.js';
import { mudancas } from '../lib/registro.js';

export const clientes = Router();

/** Acrescenta o que o painel sempre quer junto: visitas, gasto e há quanto tempo sumiu. */
async function comMetricas(c) {
  const m = await db.get(
    `SELECT COUNT(*) visitas,
            SUM(CASE WHEN pag_status='pago' THEN valor ELSE 0 END) gasto,
            MAX(CASE WHEN data <= ? THEN data END) ultima,
            SUM(CASE WHEN status='falta' THEN 1 ELSE 0 END) faltas
       FROM appointments WHERE client_id=? AND status <> 'cancelado'`,
    hoje(), c.id
  );
  return {
    ...c,
    visitas: m.visitas || 0,
    gasto: m.gasto || 0,
    faltas: m.faltas || 0,
    ultimaVisita: m.ultima || null,
    diasSemVir: m.ultima ? diasEntre(m.ultima, hoje()) : null,
  };
}

clientes.get('/', rota(async (req, res) => {
  const q = (req.query.q || '').trim();
  // ILIKE, não LIKE: no Postgres LIKE diferencia maiúscula de minúscula, e
  // buscar "amanda" deixaria de encontrar "Amanda".
  const rows = q
    ? await db.all(
        `SELECT * FROM clients WHERE nome ILIKE ? OR fone LIKE ? ORDER BY nome`,
        `%${q}%`, `%${soDigitos(q)}%`
      )
    : await db.all('SELECT * FROM clients ORDER BY nome');
  // Em sequência: a requisição roda numa conexão só, que atende uma consulta
  // por vez — o Promise.all não ganhava paralelismo, só enfileirava.
  const lista = [];
  for (const r of rows) lista.push(await comMetricas(clientOut(r)));
  res.json(lista);
}));

clientes.get('/:id', rota(async (req, res) => {
  const r = await db.get('SELECT * FROM clients WHERE id=?', req.params.id);
  if (!r) return res.status(404).json({ erro: 'cliente não encontrada' });
  const linhas = await db.all(
    'SELECT * FROM appointments WHERE client_id=? ORDER BY data DESC, hora DESC',
    req.params.id
  );
  res.json({ ...(await comMetricas(clientOut(r))), historico: linhas.map(apptOut) });
}));

clientes.post('/', rota(async (req, res) => {
  const b = req.body || {};
  const fone = soDigitos(b.fone);
  if (!b.nome || fone.length < 10) {
    return res.status(400).json({ erro: 'nome e WhatsApp com DDD são obrigatórios' });
  }
  const existe = await db.get('SELECT * FROM clients WHERE fone=?', fone);
  if (existe) return res.status(409).json({ erro: 'já existe cliente com esse WhatsApp', cliente: clientOut(existe) });

  const id = uid();
  await db.run(
    `INSERT INTO clients (id,nome,fone,nascimento,endereco,obs,optin,criado_em) VALUES (?,?,?,?,?,?,?,?)`,
    id, b.nome.trim(), fone, b.nascimento || null, b.endereco || '', b.obs || '',
    b.optin === false ? 0 : 1, hoje()
  );
  await req.registrar('cliente.criado', { alvoId: id, resumo: `cadastrou ${b.nome.trim()}` });
  res.status(201).json(await comMetricas(clientOut(await db.get('SELECT * FROM clients WHERE id=?', id))));
}));

clientes.put('/:id', rota(async (req, res) => {
  const atual = await db.get('SELECT * FROM clients WHERE id=?', req.params.id);
  if (!atual) return res.status(404).json({ erro: 'cliente não encontrada' });
  const b = { ...clientOut(atual), ...req.body };
  await db.run(
    `UPDATE clients SET nome=?, fone=?, nascimento=?, endereco=?, obs=?, optin=? WHERE id=?`,
    b.nome, soDigitos(b.fone), b.nascimento || null, b.endereco || '', b.obs || '',
    b.optin ? 1 : 0, req.params.id
  );
  const depois = clientOut(await db.get('SELECT * FROM clients WHERE id=?', req.params.id));
  // `optin` no meio: é consentimento de marketing, e quem o desligou ou ligou é
  // exatamente o que a LGPD pede para saber.
  const mudou = mudancas(clientOut(atual), depois, ['nome', 'fone', 'nascimento', 'endereco', 'obs', 'optin']);
  if (Object.keys(mudou).length) {
    await req.registrar('cliente.alterado', {
      alvoId: depois.id,
      resumo: `editou ${depois.nome} (${Object.keys(mudou).join(', ')})`,
      detalhe: mudou,
    });
  }
  res.json(await comMetricas(depois));
}));

clientes.delete('/:id', rota(async (req, res) => {
  const { n: usos } = await db.get('SELECT COUNT(*) n FROM appointments WHERE client_id=?', req.params.id);
  if (usos > 0) return res.status(409).json({ erro: `cliente tem ${usos} agendamentos; remova o histórico primeiro` });
  const alvo = await db.get('SELECT nome, fone FROM clients WHERE id=?', req.params.id);
  await db.run('DELETE FROM clients WHERE id=?', req.params.id);
  await req.registrar('cliente.apagado', {
    alvoId: req.params.id,
    resumo: `apagou a ficha de ${alvo?.nome || 'alguém'}`,
    detalhe: { nome: alvo?.nome, fone: alvo?.fone },
  });
  res.json({ ok: true });
}));
