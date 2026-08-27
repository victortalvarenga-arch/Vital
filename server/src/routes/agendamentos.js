import { Router } from 'express';
import { db, uid, apptOut, staffOut } from '../db.js';
import { hoje, agora } from '../lib/dates.js';
import { conflita, dentroDaJornada, horariosLivres, horariosPorServico } from '../lib/availability.js';
import { enfileirarConfirmacao } from '../jobs/mensagens.js';

export const agendamentos = Router();

const STATUS = ['agendado', 'confirmado', 'concluido', 'falta', 'cancelado'];
const FORMAS = ['pix', 'cartao', 'dinheiro', 'local'];

/* ── Disponibilidade ── */
agendamentos.get('/horarios', (req, res) => {
  const { servicoId, profissionalId, data } = req.query;
  if (!data) return res.status(400).json({ erro: 'informe data=YYYY-MM-DD' });

  if (profissionalId && servicoId) {
    const svc = db.prepare('SELECT * FROM services WHERE id=?').get(servicoId);
    if (!svc) return res.status(404).json({ erro: 'serviço não encontrado' });
    return res.json({
      data,
      horarios: horariosLivres({
        staffId: profissionalId, data, duracao: svc.duracao + (svc.intervalo || 0),
      }),
    });
  }
  if (servicoId) return res.json({ data, porProfissional: horariosPorServico({ servicoId, data }) });
  res.status(400).json({ erro: 'informe ao menos servicoId' });
});

/* ── Listagem ── */
agendamentos.get('/', (req, res) => {
  const { data, de, ate, profissionalId, clienteId } = req.query;
  const cond = [], args = [];
  if (data) { cond.push('data = ?'); args.push(data); }
  if (de) { cond.push('data >= ?'); args.push(de); }
  if (ate) { cond.push('data <= ?'); args.push(ate); }
  if (profissionalId) { cond.push('staff_id = ?'); args.push(profissionalId); }
  if (clienteId) { cond.push('client_id = ?'); args.push(clienteId); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  res.json(db.prepare(`SELECT * FROM appointments ${where} ORDER BY data, hora`).all(...args).map(apptOut));
});

/**
 * Cria um agendamento.
 * A validação de conflito acontece AQUI, dentro de uma transação, e não no front.
 * Duas clientes podem clicar no mesmo horário no mesmo segundo.
 */
export function criarAgendamento(b, { origem = 'painel', forcar = false } = {}) {
  const svc = db.prepare('SELECT * FROM services WHERE id=?').get(b.servicoId);
  if (!svc) return { erro: 'serviço não encontrado', codigo: 404 };
  const prof = db.prepare('SELECT * FROM staff WHERE id=?').get(b.profissionalId);
  if (!prof) return { erro: 'profissional não encontrada', codigo: 404 };
  const cli = db.prepare('SELECT * FROM clients WHERE id=?').get(b.clienteId);
  if (!cli) return { erro: 'cliente não encontrada', codigo: 404 };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.data || '') || !/^\d{2}:\d{2}$/.test(b.hora || '')) {
    return { erro: 'data (YYYY-MM-DD) e hora (HH:MM) inválidas', codigo: 400 };
  }

  const duracao = +b.duracao || svc.duracao + (svc.intervalo || 0);

  // Encaixe manual pode furar a jornada; agendamento pelo site, não.
  if (!forcar && !dentroDaJornada(staffOut(prof), b.data, b.hora, duracao)) {
    return { erro: `${prof.nome} não trabalha nesse horário`, codigo: 409 };
  }
  if (conflita({ staffId: b.profissionalId, data: b.data, hora: b.hora, duracao })) {
    return { erro: 'esse horário acabou de ser ocupado', codigo: 409 };
  }

  const id = uid();
  db.prepare(
    `INSERT INTO appointments (id,client_id,service_id,staff_id,data,hora,duracao,valor,
                               status,pag_status,pag_forma,origem,obs,criado_em)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(id, b.clienteId, b.servicoId, b.profissionalId, b.data, b.hora, duracao,
        b.valor != null ? +b.valor : svc.preco,
        b.status || 'agendado',
        b.pagamento?.status || 'aberto', b.pagamento?.forma || 'local',
        origem, b.obs || '', `${hoje()} ${agora()}`);

  const criado = db.prepare('SELECT * FROM appointments WHERE id=?').get(id);
  enfileirarConfirmacao(criado);
  return { agendamento: apptOut(criado) };
}

agendamentos.post('/', (req, res) => {
  const r = criarAgendamento(req.body || {}, { origem: 'painel', forcar: req.body?.forcar === true });
  if (r.erro) return res.status(r.codigo).json({ erro: r.erro });
  res.status(201).json(r.agendamento);
});

agendamentos.put('/:id', (req, res) => {
  const atual = db.prepare('SELECT * FROM appointments WHERE id=?').get(req.params.id);
  if (!atual) return res.status(404).json({ erro: 'agendamento não encontrado' });
  const b = req.body || {};

  if (b.status && !STATUS.includes(b.status)) return res.status(400).json({ erro: 'status inválido' });
  if (b.pagamento?.forma && !FORMAS.includes(b.pagamento.forma)) {
    return res.status(400).json({ erro: 'forma de pagamento inválida' });
  }

  const data = b.data || atual.data;
  const hora = b.hora || atual.hora;
  const staffId = b.profissionalId || atual.staff_id;
  const duracao = b.duracao != null ? +b.duracao : atual.duracao;

  const mudouHorario = data !== atual.data || hora !== atual.hora || staffId !== atual.staff_id;
  if (mudouHorario && conflita({ staffId, data, hora, duracao, ignorarId: atual.id })) {
    return res.status(409).json({ erro: 'conflito com outro agendamento' });
  }

  db.prepare(
    `UPDATE appointments SET client_id=?, service_id=?, staff_id=?, data=?, hora=?, duracao=?,
            valor=?, status=?, pag_status=?, pag_forma=?, pag_ref=?, obs=? WHERE id=?`
  ).run(
    b.clienteId || atual.client_id,
    b.servicoId || atual.service_id,
    staffId, data, hora, duracao,
    b.valor != null ? +b.valor : atual.valor,
    b.status || atual.status,
    b.pagamento?.status || atual.pag_status,
    b.pagamento?.forma || atual.pag_forma,
    b.pagamento?.ref ?? atual.pag_ref,
    b.obs ?? atual.obs,
    req.params.id
  );

  // Remarcou? Os lembretes antigos não valem mais.
  if (mudouHorario) {
    db.prepare(`DELETE FROM messages WHERE appointment_id=? AND status='pendente'`).run(req.params.id);
  }
  res.json(apptOut(db.prepare('SELECT * FROM appointments WHERE id=?').get(req.params.id)));
});

agendamentos.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM messages WHERE appointment_id=? AND status='pendente'`).run(req.params.id);
  db.prepare('DELETE FROM appointments WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});
