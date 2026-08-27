import { Router } from 'express';
import { db, uid, apptOut, staffOut } from '../db.js';
import { hoje, agora } from '../lib/dates.js';
import { conflita, dentroDaJornada, horariosLivres, horariosPorServico } from '../lib/availability.js';
import { rota } from '../lib/rota.js';
import { enfileirarConfirmacao } from '../jobs/mensagens.js';

export const agendamentos = Router();

const STATUS = ['agendado', 'confirmado', 'concluido', 'falta', 'cancelado'];
const FORMAS = ['pix', 'cartao', 'dinheiro', 'local'];

/* ── Disponibilidade ── */
agendamentos.get('/horarios', rota(async (req, res) => {
  const { servicoId, profissionalId, data } = req.query;
  if (!data) return res.status(400).json({ erro: 'informe data=YYYY-MM-DD' });

  if (profissionalId && servicoId) {
    const svc = await db.get('SELECT * FROM services WHERE id=?', servicoId);
    if (!svc) return res.status(404).json({ erro: 'serviço não encontrado' });
    return res.json({
      data,
      horarios: await horariosLivres({
        staffId: profissionalId, data, duracao: svc.duracao + (svc.intervalo || 0),
      }),
    });
  }
  if (servicoId) return res.json({ data, porProfissional: await horariosPorServico({ servicoId, data }) });
  res.status(400).json({ erro: 'informe ao menos servicoId' });
}));

/* ── Listagem ── */
agendamentos.get('/', rota(async (req, res) => {
  const { data, de, ate, profissionalId, clienteId } = req.query;
  const cond = [], args = [];
  if (data) { cond.push('data = ?'); args.push(data); }
  if (de) { cond.push('data >= ?'); args.push(de); }
  if (ate) { cond.push('data <= ?'); args.push(ate); }
  if (profissionalId) { cond.push('staff_id = ?'); args.push(profissionalId); }
  if (clienteId) { cond.push('client_id = ?'); args.push(clienteId); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const rows = await db.all(`SELECT * FROM appointments ${where} ORDER BY data, hora`, ...args);
  res.json(rows.map(apptOut));
}));

/**
 * Cria um agendamento.
 *
 * A conferência de conflito e a gravação acontecem na MESMA transação, e não no
 * front. Duas clientes podem clicar no mesmo horário no mesmo segundo — se a
 * conferência ficasse fora da transação, as duas leriam "livre" antes de
 * qualquer uma gravar, e as duas gravariam.
 */
export async function criarAgendamento(b, { origem = 'painel', forcar = false } = {}) {
  const svc = await db.get('SELECT * FROM services WHERE id=?', b.servicoId);
  if (!svc) return { erro: 'serviço não encontrado', codigo: 404 };
  const prof = await db.get('SELECT * FROM staff WHERE id=?', b.profissionalId);
  if (!prof) return { erro: 'profissional não encontrada', codigo: 404 };
  const cli = await db.get('SELECT * FROM clients WHERE id=?', b.clienteId);
  if (!cli) return { erro: 'cliente não encontrada', codigo: 404 };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.data || '') || !/^\d{2}:\d{2}$/.test(b.hora || '')) {
    return { erro: 'data (YYYY-MM-DD) e hora (HH:MM) inválidas', codigo: 400 };
  }

  const duracao = +b.duracao || svc.duracao + (svc.intervalo || 0);

  // Encaixe manual pode furar a jornada; agendamento pelo site, não.
  if (!forcar && !dentroDaJornada(staffOut(prof), b.data, b.hora, duracao)) {
    return { erro: `${prof.nome} não trabalha nesse horário`, codigo: 409 };
  }

  const id = uid();
  const resultado = await db.transacao(async tx => {
    if (await conflita({ staffId: b.profissionalId, data: b.data, hora: b.hora, duracao }, tx)) {
      return { erro: 'esse horário acabou de ser ocupado', codigo: 409 };
    }
    await tx.run(
      `INSERT INTO appointments (id,client_id,service_id,staff_id,data,hora,duracao,valor,
                                 status,pag_status,pag_forma,origem,obs,criado_em)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, b.clienteId, b.servicoId, b.profissionalId, b.data, b.hora, duracao,
      b.valor != null ? +b.valor : svc.preco,
      b.status || 'agendado',
      b.pagamento?.status || 'aberto', b.pagamento?.forma || 'local',
      origem, b.obs || '', `${hoje()} ${agora()}`
    );
    return { criado: await tx.get('SELECT * FROM appointments WHERE id=?', id) };
  });

  if (resultado.erro) return resultado;

  await enfileirarConfirmacao(resultado.criado);
  return { agendamento: apptOut(resultado.criado) };
}

agendamentos.post('/', rota(async (req, res) => {
  const r = await criarAgendamento(req.body || {}, { origem: 'painel', forcar: req.body?.forcar === true });
  if (r.erro) return res.status(r.codigo).json({ erro: r.erro });
  res.status(201).json(r.agendamento);
}));

agendamentos.put('/:id', rota(async (req, res) => {
  const atual = await db.get('SELECT * FROM appointments WHERE id=?', req.params.id);
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

  const resultado = await db.transacao(async tx => {
    if (mudouHorario && await conflita({ staffId, data, hora, duracao, ignorarId: atual.id }, tx)) {
      return { erro: 'conflito com outro agendamento' };
    }
    await tx.run(
      `UPDATE appointments SET client_id=?, service_id=?, staff_id=?, data=?, hora=?, duracao=?,
              valor=?, status=?, pag_status=?, pag_forma=?, pag_ref=?, obs=? WHERE id=?`,
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
      await tx.run(`DELETE FROM messages WHERE appointment_id=? AND status='pendente'`, req.params.id);
    }
    return { atualizado: await tx.get('SELECT * FROM appointments WHERE id=?', req.params.id) };
  });

  if (resultado.erro) return res.status(409).json({ erro: resultado.erro });
  res.json(apptOut(resultado.atualizado));
}));

agendamentos.delete('/:id', rota(async (req, res) => {
  await db.transacao(async tx => {
    await tx.run(`DELETE FROM messages WHERE appointment_id=? AND status='pendente'`, req.params.id);
    await tx.run('DELETE FROM appointments WHERE id=?', req.params.id);
  });
  res.json({ ok: true });
}));
