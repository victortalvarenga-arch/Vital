import { db, staffOut, getConfig } from '../db.js';
import { toMin, toHora, diaSemana, hoje, agora } from './dates.js';

/**
 * Motor de horários. É o coração do sistema: se isto estiver errado,
 * duas clientes marcam o mesmo horário. Toda checagem de conflito passa por aqui,
 * inclusive na hora de gravar — nunca confie só na validação do front.
 */

const STATUS_OCUPA = ['agendado', 'confirmado', 'concluido'];

/** Agendamentos que ocupam a cadeira de um profissional num dia. */
export function ocupacao(staffId, data, ignorarId = null) {
  return db.prepare(
    `SELECT id, hora, duracao FROM appointments
      WHERE staff_id = ? AND data = ? AND status IN (${STATUS_OCUPA.map(() => '?').join(',')})
        AND id IS NOT ?`
  ).all(staffId, data, ...STATUS_OCUPA, ignorarId);
}

export function conflita({ staffId, data, hora, duracao, ignorarId = null }) {
  const ini = toMin(hora), fim = ini + duracao;
  return ocupacao(staffId, data, ignorarId).some(a => {
    const aIni = toMin(a.hora), aFim = aIni + a.duracao;
    return ini < aFim && fim > aIni;
  });
}

/** Confere se o horário cabe na jornada daquele dia da semana. */
export function dentroDaJornada(staff, data, hora, duracao) {
  const j = staff.jornada[String(diaSemana(data))];
  if (!j) return false;
  const ini = toMin(hora);
  return ini >= toMin(j[0]) && ini + duracao <= toMin(j[1]);
}

/**
 * Horários livres de um profissional para um serviço num dia.
 * @param {object} o
 * @param {string} o.staffId
 * @param {string} o.data       'YYYY-MM-DD'
 * @param {number} o.duracao    minutos (serviço + intervalo de limpeza)
 * @param {number} o.passo      granularidade da grade, em minutos
 * @returns {string[]} ex. ['09:00','09:30']
 */
export function horariosLivres({ staffId, data, duracao, passo }) {
  const row = db.prepare('SELECT * FROM staff WHERE id = ? AND ativo = 1').get(staffId);
  if (!row) return [];
  const staff = staffOut(row);
  const j = staff.jornada[String(diaSemana(data))];
  if (!j) return [];

  const cfg = getConfig();
  const grade = passo || cfg.passoAgenda || 30;
  const antecedencia = (cfg.antecedenciaHoras ?? 2) * 60;

  const ocupados = ocupacao(staffId, data);
  const limite = data === hoje() ? toMin(agora()) + antecedencia : -1;

  const livres = [];
  for (let m = toMin(j[0]); m + duracao <= toMin(j[1]); m += grade) {
    if (m < limite) continue;
    const bate = ocupados.some(a => m < toMin(a.hora) + a.duracao && m + duracao > toMin(a.hora));
    if (!bate) livres.push(toHora(m));
  }
  return livres;
}

/** Mesma coisa, porém para todos os profissionais habilitados no serviço. */
export function horariosPorServico({ servicoId, data }) {
  const svc = db.prepare('SELECT * FROM services WHERE id = ?').get(servicoId);
  if (!svc) return [];
  const ids = db.prepare('SELECT staff_id FROM service_staff WHERE service_id = ?')
    .all(servicoId).map(r => r.staff_id);
  const duracao = svc.duracao + (svc.intervalo || 0);
  return ids.map(id => ({
    profissionalId: id,
    horarios: horariosLivres({ staffId: id, data, duracao }),
  })).filter(x => x.horarios.length);
}
