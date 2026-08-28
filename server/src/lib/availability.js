import { db, staffOut, getConfig } from '../db.js';
import { toMin, toHora, diaSemana, hoje, agora, addDias } from './dates.js';

/**
 * Motor de horários. É o coração do sistema: se isto estiver errado,
 * duas clientes marcam o mesmo horário. Toda checagem de conflito passa por aqui,
 * inclusive na hora de gravar — nunca confie só na validação do front.
 *
 * As funções aceitam um `exec` opcional: quando a checagem acontece dentro de
 * uma transação, ela precisa enxergar o que a própria transação já escreveu.
 * Sem isso, a conferência leria o banco de fora e não veria o agendamento que
 * está sendo criado ao lado.
 */

const STATUS_OCUPA = ['agendado', 'confirmado', 'concluido'];

/**
 * Bloqueios que fecham a cadeira de alguém num dia.
 *
 * `staff_id` nulo fecha para a equipe inteira — é como se marca feriado ou
 * reforma, sem repetir a linha para cada profissional.
 *
 * Ocupação e bloqueio são coisas diferentes de propósito: um agendamento pode
 * ser remarcado e some da agenda; um bloqueio é a empresa dizendo que ali não
 * se atende. Misturar os dois numa tabela só faria "cancelar o almoço" virar
 * cancelamento de atendimento no relatório.
 */
export async function bloqueios(staffId, data, exec = db) {
  return exec.all(
    `SELECT hora_ini, hora_fim, motivo FROM blocks
      WHERE data = ? AND (staff_id = ? OR staff_id IS NULL)`,
    data, staffId
  );
}

/** Um intervalo cai em cima de algum bloqueio? */
const dentroDeBloqueio = (ini, fim, lista) =>
  lista.some(b => ini < toMin(b.hora_fim) && fim > toMin(b.hora_ini));

/** Agendamentos que ocupam a cadeira de um profissional num dia. */
export async function ocupacao(staffId, data, ignorarId = null, exec = db) {
  // IS DISTINCT FROM, e não IS NOT: o Postgres só aceita `IS NOT` com NULL,
  // TRUE ou FALSE literais. IS DISTINCT FROM compara com parâmetro e trata
  // NULL do jeito que se espera aqui (nada a ignorar).
  return exec.all(
    `SELECT id, hora, duracao FROM appointments
      WHERE staff_id = ? AND data = ? AND status IN (${STATUS_OCUPA.map(() => '?').join(',')})
        AND id IS DISTINCT FROM ?`,
    staffId, data, ...STATUS_OCUPA, ignorarId
  );
}

export async function conflita({ staffId, data, hora, duracao, ignorarId = null }, exec = db) {
  const ini = toMin(hora), fim = ini + duracao;
  const ocupados = await ocupacao(staffId, data, ignorarId, exec);
  if (ocupados.some(a => {
    const aIni = toMin(a.hora), aFim = aIni + a.duracao;
    return ini < aFim && fim > aIni;
  })) return true;

  // Bloqueio conta como ocupado na hora de gravar, não só ao desenhar a grade:
  // sem isto, quem tivesse a página aberta desde antes do bloqueio ainda
  // conseguiria marcar em cima do almoço.
  return dentroDeBloqueio(ini, fim, await bloqueios(staffId, data, exec));
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
 * @returns {Promise<string[]>} ex. ['09:00','09:30']
 */
export async function horariosLivres({ staffId, data, duracao, passo }) {
  const row = await db.get('SELECT * FROM staff WHERE id = ? AND ativo = 1', staffId);
  if (!row) return [];
  const staff = staffOut(row);
  const j = staff.jornada[String(diaSemana(data))];
  if (!j) return [];

  const cfg = await getConfig();
  const grade = passo || cfg.passoAgenda || 30;
  const antecedencia = (cfg.antecedenciaHoras ?? 2) * 60;

  const ocupados = await ocupacao(staffId, data);
  const fechados = await bloqueios(staffId, data);
  const limite = data === hoje() ? toMin(agora()) + antecedencia : -1;

  const livres = [];
  for (let m = toMin(j[0]); m + duracao <= toMin(j[1]); m += grade) {
    if (m < limite) continue;
    const bate = ocupados.some(a => m < toMin(a.hora) + a.duracao && m + duracao > toMin(a.hora));
    if (!bate && !dentroDeBloqueio(m, m + duracao, fechados)) livres.push(toHora(m));
  }
  return livres;
}

/** Mesma coisa, porém para todos os profissionais habilitados no serviço. */
export async function horariosPorServico({ servicoId, data, duracaoExtra = 0 }) {
  const svc = await db.get('SELECT * FROM services WHERE id = ?', servicoId);
  if (!svc) return [];
  const vinculos = await db.all('SELECT staff_id FROM service_staff WHERE service_id = ?', servicoId);
  const duracao = svc.duracao + (svc.intervalo || 0) + duracaoExtra;

  const resultado = [];
  for (const { staff_id: id } of vinculos) {
    const horarios = await horariosLivres({ staffId: id, data, duracao });
    if (horarios.length) resultado.push({ profissionalId: id, horarios });
  }
  return resultado;
}

/**
 * Quais dias de um mês têm pelo menos um horário livre.
 *
 * Existe para o calendário mensal do site poder pintar de uma vez só quais
 * datas valem o toque. Chamar `horariosLivres()` dia a dia daria trinta idas ao
 * banco para desenhar uma tela — aqui é uma consulta de agendamentos para o mês
 * inteiro, e o resto é conta em memória.
 *
 * @param {object} o
 * @param {string} o.servicoId
 * @param {string} [o.profissionalId]  vazio = qualquer pessoa que faça o serviço
 * @param {string} o.mes               'YYYY-MM'
 * @param {number} [o.duracaoExtra]    minutos dos serviços adicionais escolhidos
 * @returns {Promise<string[]>} datas 'YYYY-MM-DD' com vaga
 */
export async function diasComVaga({ servicoId, profissionalId, mes, duracaoExtra = 0 }) {
  const svc = await db.get('SELECT * FROM services WHERE id = ? AND ativo = 1', servicoId);
  if (!svc) return [];
  const duracao = svc.duracao + (svc.intervalo || 0) + duracaoExtra;

  const equipe = profissionalId
    ? await db.all('SELECT * FROM staff WHERE id = ? AND ativo = 1', profissionalId)
    : await db.all(
        `SELECT s.* FROM staff s
           JOIN service_staff ss ON ss.staff_id = s.id
          WHERE ss.service_id = ? AND s.ativo = 1`,
        servicoId
      );
  if (!equipe.length) return [];

  const cfg = await getConfig();
  const grade = cfg.passoAgenda || 30;
  const antecedencia = (cfg.antecedenciaHoras ?? 2) * 60;
  const janela = cfg.janelaDias || 30;

  const primeiro = `${mes}-01`;
  const ultimo = ultimoDiaDoMes(mes);
  const h = hoje();
  const limiteFuturo = addDias(h, janela);

  // Uma consulta para o mês inteiro, em vez de uma por dia.
  const ocupados = await db.all(
    `SELECT staff_id, data, hora, duracao FROM appointments
      WHERE data >= ? AND data <= ? AND status IN (${STATUS_OCUPA.map(() => '?').join(',')})`,
    primeiro, ultimo, ...STATUS_OCUPA
  );
  const porStaffEData = new Map();
  for (const a of ocupados) {
    const chave = `${a.staff_id}|${a.data}`;
    if (!porStaffEData.has(chave)) porStaffEData.set(chave, []);
    porStaffEData.get(chave).push(a);
  }

  // Os bloqueios do mês vêm na mesma leva, pelo mesmo motivo dos agendamentos:
  // buscar por dia seriam trinta idas ao banco para pintar uma tela.
  const fechados = await db.all(
    `SELECT staff_id, data, hora_ini, hora_fim FROM blocks
      WHERE data >= ? AND data <= ?`,
    primeiro, ultimo
  );
  const bloqueadosPorDia = new Map();
  for (const b of fechados) {
    // staff_id nulo fecha para todo mundo: entra na lista de cada profissional.
    const alvos = b.staff_id ? [b.staff_id] : equipe.map(e => e.id);
    for (const id of alvos) {
      const chave = `${id}|${b.data}`;
      if (!bloqueadosPorDia.has(chave)) bloqueadosPorDia.set(chave, []);
      bloqueadosPorDia.get(chave).push(b);
    }
  }

  const livres = [];
  for (let dia = primeiro; dia <= ultimo; dia = addDias(dia, 1)) {
    if (dia < h || dia > limiteFuturo) continue;          // passado ou além da janela
    const limiteHoje = dia === h ? toMin(agora()) + antecedencia : -1;

    const temVaga = equipe.some(row => {
      const jornada = staffOut(row).jornada[String(diaSemana(dia))];
      if (!jornada) return false;
      const agenda = porStaffEData.get(`${row.id}|${dia}`) || [];
      const fechado = bloqueadosPorDia.get(`${row.id}|${dia}`) || [];
      for (let m = toMin(jornada[0]); m + duracao <= toMin(jornada[1]); m += grade) {
        if (m < limiteHoje) continue;
        const bate = agenda.some(a => m < toMin(a.hora) + a.duracao && m + duracao > toMin(a.hora));
        if (!bate && !dentroDeBloqueio(m, m + duracao, fechado)) return true;   // achou uma, basta
      }
      return false;
    });

    if (temVaga) livres.push(dia);
  }
  return livres;
}

function ultimoDiaDoMes(mes) {
  const [ano, m] = mes.split('-').map(Number);
  // Dia 0 do mês seguinte = último dia deste. Em UTC, para não escorregar de fuso.
  return new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10);
}
