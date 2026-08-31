import { Router } from 'express';
import { db, uid, blockOut } from '../db.js';
import { hoje, toMin, addDias } from '../lib/dates.js';
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

/**
 * Como a data anda de uma ocorrência para a próxima.
 *
 * `mes` soma mês, não trinta dias: "toda dia 5" é o que a pessoa quer dizer.
 * Dia 31 em mês de 30 escorrega para o dia 1 do seguinte — comportamento do
 * `Date`, e o menos surpreendente entre os ruins (a alternativa seria pular a
 * ocorrência, que some sem avisar).
 */
const CADA = {
  dia: (iso, i) => addDias(iso, i),
  semana: (iso, i) => addDias(iso, i * 7),
  mes: (iso, i) => {
    const d = new Date(iso + 'T12:00:00');
    d.setMonth(d.getMonth() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
};

// Tetos para não transformar um erro de digitação em dez mil linhas. Um ano de
// folga semanal cabe (52); a lista explícita aceita mais porque "segunda e
// quarta por seis meses" já são cinquenta e poucas datas legítimas.
const MAX_REPETICOES = 52;
const MAX_DATAS = 400;

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

  // Duas formas de dizer quando. `data` + `repetir` é a simples — um dia que se
  // repete. `datas` é a lista pronta, que a tela usa para "segunda e quarta,
  // por seis semanas": o calendário disso já foi calculado lá para a pessoa
  // conferir antes de criar, e refazer a conta aqui seria uma segunda versão da
  // mesma regra, livre para divergir da que ela viu na tela.
  const explicitas = Array.isArray(b.datas) ? [...new Set(b.datas)].sort() : null;
  if (explicitas && !explicitas.length) {
    return res.status(400).json({ erro: 'informe ao menos uma data' });
  }
  if (explicitas && explicitas.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d))) {
    return res.status(400).json({ erro: 'data inválida na lista (use YYYY-MM-DD)' });
  }
  if (!explicitas && !/^\d{4}-\d{2}-\d{2}$/.test(b.data || '')) {
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

  // Repetição: uma linha por ocorrência (ver migration 013). `vezes` 1 é o
  // bloqueio avulso de sempre, e continua sendo a maioria.
  const cada = CADA[b.repetir?.cada] ? b.repetir.cada : 'semana';
  const vezes = Math.min(Math.max(Number(b.repetir?.vezes) || 1, 1), MAX_REPETICOES);

  const datas = explicitas
    ? explicitas.slice(0, MAX_DATAS)
    : Array.from({ length: vezes }, (_, i) => CADA[cada](b.data, i));
  const serie = datas.length > 1 ? uid() : null;
  const criados = [];
  for (const data of datas) {
    const id = uid();
    await db.run(
      `INSERT INTO blocks (id, staff_id, data, hora_ini, hora_fim, motivo, serie, criado_em)
       VALUES (?,?,?,?,?,?,?,?)`,
      id, staffId, data, b.horaIni, b.horaFim,
      String(b.motivo || '').slice(0, 200), serie, hoje()
    );
    criados.push(id);
  }

  // Já havia agendamento no intervalo? Bloquear não desmarca ninguém — seria
  // furar a agenda de uma cliente sem avisar. A equipe precisa saber para
  // remarcar à mão. Com repetição, a conferência é em todas as datas: avisar
  // só da primeira esconderia justamente as que a pessoa não olhou.
  const conflitos = await db.all(
    `SELECT a.id, a.data, a.hora, a.duracao, c.nome AS cliente
       FROM appointments a JOIN clients c ON c.id = a.client_id
      WHERE a.data IN (${datas.map(() => '?').join(',')})
        AND a.status IN ('agendado','confirmado')
        ${staffId ? 'AND a.staff_id = ?' : ''}
      ORDER BY a.data, a.hora`,
    ...datas, ...(staffId ? [staffId] : [])
  );
  const afetados = conflitos.filter(a =>
    toMin(a.hora) < toMin(b.horaFim) && toMin(a.hora) + a.duracao > toMin(b.horaIni)
  );

  const quando = datas.length > 1
    ? `${datas[0]} e mais ${datas.length - 1}`
      + (explicitas ? '' : ` (a cada ${cada})`)
    : datas[0];
  await req.registrar('bloqueio.criado', {
    alvoId: serie || criados[0],
    resumo: `fechou ${quando} das ${b.horaIni} às ${b.horaFim}`
      + (staffId ? '' : ' para a empresa toda'),
    detalhe: {
      motivo: b.motivo || '', datas: datas.length,
      ...(explicitas ? {} : { vezes, cada }),
      jaAgendados: afetados.length,
    },
  });

  res.status(201).json({
    bloqueio: blockOut(await db.get('SELECT * FROM blocks WHERE id=?', criados[0])),
    criados: criados.length,
    serie,
    jaAgendados: afetados.map(a => ({ id: a.id, data: a.data, hora: a.hora, cliente: a.cliente })),
  });
}));

/**
 * Libera um bloqueio. Com `?serie=1`, libera todas as ocorrências que nasceram
 * da mesma criação — "cancelei as férias" é um comando, não vinte e um.
 *
 * Sem o parâmetro, apaga só a linha pedida: desmarcar uma terça no meio de uma
 * folga semanal é o caso normal, e é para isso que cada ocorrência é uma linha
 * de verdade (ver migration 013).
 */
bloqueios.delete('/:id', rota(async (req, res) => {
  const alvo = await db.get('SELECT * FROM blocks WHERE id=?', req.params.id);
  if (!alvo) return res.status(404).json({ erro: 'bloqueio não encontrado' });
  if (!podeMexer(req.usuario, alvo.staff_id)) {
    return res.status(403).json({ erro: 'você só pode liberar a própria agenda' });
  }

  const aSerie = req.query.serie === '1' && alvo.serie;
  const apagados = aSerie
    ? await db.run('DELETE FROM blocks WHERE serie=?', alvo.serie)
    : await db.run('DELETE FROM blocks WHERE id=?', req.params.id);

  await req.registrar('bloqueio.liberado', {
    alvoId: alvo.id,
    resumo: aSerie
      ? `liberou ${apagados} datas das ${alvo.hora_ini} às ${alvo.hora_fim}`
      : `liberou ${alvo.data} das ${alvo.hora_ini} às ${alvo.hora_fim}`,
    detalhe: { serie: aSerie ? alvo.serie : null, apagados },
  });
  res.json({ ok: true, apagados });
}));
