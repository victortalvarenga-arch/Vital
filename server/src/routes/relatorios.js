import { Router } from 'express';
import { db } from '../db.js';
import { hoje } from '../lib/dates.js';
import { rota } from '../lib/rota.js';
import { escopoDe } from '../lib/auth.js';

export const relatorios = Router();

/** Resumo financeiro de um mês ('YYYY-MM'). */
relatorios.get('/resumo', rota(async (req, res) => {
  const mes = req.query.mes || hoje().slice(0, 7);
  const like = `${mes}-%`;
  const h = hoje();

  // Funcionário vê a própria produção; dono vê o negócio inteiro. O recorte
  // entra em TODAS as consultas — deixar uma de fora vazaria o faturamento da
  // empresa numa linha só.
  const so = escopoDe(req.usuario);
  const meu = so ? 'AND staff_id = ?' : '';
  const meuA = so ? 'AND a.staff_id = ?' : '';
  const arg = so ? [so] : [];

  const g = await db.get(
    `SELECT
        SUM(CASE WHEN status='concluido' AND pag_status='pago' THEN valor ELSE 0 END) recebido,
        SUM(CASE WHEN status='concluido' THEN 1 ELSE 0 END) atendimentos,
        SUM(CASE WHEN status='falta' THEN 1 ELSE 0 END) faltas,
        SUM(CASE WHEN status='cancelado' THEN 1 ELSE 0 END) cancelados
       FROM appointments WHERE data LIKE ? ${meu}`,
    like, ...arg
  );

  const aReceber = (await db.get(
    `SELECT SUM(valor) v FROM appointments
      WHERE pag_status='aberto' AND data <= ? AND status IN ('agendado','confirmado','concluido') ${meu}`,
    h, ...arg
  )).v || 0;

  const previstoHoje = (await db.get(
    `SELECT SUM(valor) v FROM appointments WHERE data=? AND status <> 'cancelado' ${meu}`,
    h, ...arg
  )).v || 0;

  const porServico = await db.all(
    `SELECT s.nome, COUNT(*) qtd, SUM(a.valor) total
       FROM appointments a JOIN services s ON s.id=a.service_id
      WHERE a.data LIKE ? AND a.status='concluido' ${meuA}
      GROUP BY s.id, s.nome ORDER BY total DESC`,
    like, ...arg
  );

  const producao = await db.all(
    `SELECT p.id, p.nome, p.comissao, COUNT(*) qtd, SUM(a.valor) producao
       FROM appointments a JOIN staff p ON p.id=a.staff_id
      WHERE a.data LIKE ? AND a.status='concluido' ${meuA}
      GROUP BY p.id, p.nome, p.comissao ORDER BY producao DESC`,
    like, ...arg
  );
  const porProfissional = producao.map(r => ({
    ...r, comissaoValor: (r.producao || 0) * (r.comissao || 0) / 100,
  }));

  const porForma = await db.all(
    `SELECT pag_forma forma, SUM(valor) total FROM appointments
      WHERE data LIKE ? AND pag_status='pago' ${meu}
      GROUP BY pag_forma ORDER BY total DESC`,
    like, ...arg
  );

  const recebido = g.recebido || 0;
  res.json({
    mes,
    recebido,
    aReceber,
    previstoHoje,
    atendimentos: g.atendimentos || 0,
    faltas: g.faltas || 0,
    cancelados: g.cancelados || 0,
    ticketMedio: g.atendimentos ? recebido / g.atendimentos : 0,
    porServico, porProfissional, porForma,
    // A tela precisa saber que está vendo um recorte, senão o dono acha que o
    // faturamento caiu quando na verdade está olhando pelo login errado.
    somenteMeu: Boolean(so),
  });
}));

/** Ocupação da agenda: quanto da jornada foi vendido. Serve para decidir contratação. */
relatorios.get('/ocupacao', rota(async (req, res) => {
  const de = req.query.de || hoje().slice(0, 7) + '-01';
  const ate = req.query.ate || hoje();
  const so = escopoDe(req.usuario);
  const rows = await db.all(
    `SELECT p.nome, SUM(a.duracao) minutos_vendidos, COUNT(*) atendimentos
       FROM appointments a JOIN staff p ON p.id=a.staff_id
      WHERE a.data BETWEEN ? AND ? AND a.status IN ('confirmado','concluido')
        ${so ? 'AND a.staff_id = ?' : ''}
      GROUP BY p.id, p.nome`,
    de, ate, ...(so ? [so] : [])
  );
  res.json({ de, ate, profissionais: rows });
}));
