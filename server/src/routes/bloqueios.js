import { Router } from 'express';
import { db, uid, blockOut } from '../db.js';
import { hoje, toMin } from '../lib/dates.js';
import { rota } from '../lib/rota.js';
import { pode } from '../lib/auth.js';

export const bloqueios = Router();

/**
 * Horários fechados: almoço, folga, feriado, reforma.
 *
 * É o outro lado da jornada. A jornada diz quando se atende em geral; o
 * bloqueio diz quando, excepcionalmente, não se atende — e o motor de horários
 * consulta os dois antes de oferecer qualquer vaga.
 *
 * `staff_id` nulo fecha para a equipe inteira, que é como se marca feriado sem
 * repetir a linha para cada pessoa.
 */

/** Quem pode mexer no bloqueio de quem. */
function podeMexer(usuario, staffId) {
  if (pode(usuario.papel, 'verDeTodos')) return true;
  // Funcionário fecha a própria agenda e só ela. Bloqueio sem dono fecha a
  // empresa toda — decisão do dono, não de quem atende.
  return Boolean(staffId) && staffId === usuario.profissionalId;
}

bloqueios.get('/', rota(async (req, res) => {
  const de = req.query.de || hoje();
  const ate = req.query.ate || de;
  const linhas = await db.all(
    'SELECT * FROM blocks WHERE data >= ? AND data <= ? ORDER BY data, hora_ini',
    de, ate
  );
  // Funcionário vê o que fecha a agenda dele: o próprio e os da empresa toda.
  const meus = pode(req.usuario.papel, 'verDeTodos')
    ? linhas
    : linhas.filter(b => !b.staff_id || b.staff_id === req.usuario.profissionalId);
  res.json(meus.map(blockOut));
}));

bloqueios.post('/', rota(async (req, res) => {
  const b = req.body || {};
  const staffId = b.profissionalId || null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.data || '')) {
    return res.status(400).json({ erro: 'informe a data (YYYY-MM-DD)' });
  }
  if (!/^\d{2}:\d{2}$/.test(b.horaIni || '') || !/^\d{2}:\d{2}$/.test(b.horaFim || '')) {
    return res.status(400).json({ erro: 'informe hora de início e fim (HH:MM)' });
  }
  if (toMin(b.horaFim) <= toMin(b.horaIni)) {
    return res.status(400).json({ erro: 'a hora de fim precisa ser depois da de início' });
  }
  if (!podeMexer(req.usuario, staffId)) {
    return res.status(403).json({ erro: 'você só pode bloquear a própria agenda' });
  }

  const id = uid();
  await db.run(
    `INSERT INTO blocks (id, staff_id, data, hora_ini, hora_fim, motivo, criado_em)
     VALUES (?,?,?,?,?,?,?)`,
    id, staffId, b.data, b.horaIni, b.horaFim, String(b.motivo || '').slice(0, 200), hoje()
  );

  // Já havia agendamento no intervalo? Bloquear não desmarca ninguém — seria
  // furar a agenda de uma cliente sem avisar. A equipe precisa saber para
  // remarcar à mão.
  const conflitos = await db.all(
    `SELECT a.id, a.hora, a.duracao, c.nome AS cliente
       FROM appointments a JOIN clients c ON c.id = a.client_id
      WHERE a.data = ? AND a.status IN ('agendado','confirmado')
        ${staffId ? 'AND a.staff_id = ?' : ''}`,
    b.data, ...(staffId ? [staffId] : [])
  );
  const afetados = conflitos.filter(a =>
    toMin(a.hora) < toMin(b.horaFim) && toMin(a.hora) + a.duracao > toMin(b.horaIni)
  );

  res.status(201).json({
    bloqueio: blockOut(await db.get('SELECT * FROM blocks WHERE id=?', id)),
    jaAgendados: afetados.map(a => ({ id: a.id, hora: a.hora, cliente: a.cliente })),
  });
}));

bloqueios.delete('/:id', rota(async (req, res) => {
  const alvo = await db.get('SELECT * FROM blocks WHERE id=?', req.params.id);
  if (!alvo) return res.status(404).json({ erro: 'bloqueio não encontrado' });
  if (!podeMexer(req.usuario, alvo.staff_id)) {
    return res.status(403).json({ erro: 'você só pode liberar a própria agenda' });
  }
  await db.run('DELETE FROM blocks WHERE id=?', req.params.id);
  res.json({ ok: true });
}));
