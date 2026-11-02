/**
 * Onde a agenda de uma pessoa está fechada, em minutos do dia.
 *
 * A grade desenha das 8h às 20h porque é a faixa em que a empresa cabe, mas
 * quem atende das 13h às 19h tem cinco horas de grade que não são horário
 * vago: são horário que não existe. A diferença só aparecia ao tentar marcar —
 * o servidor recusava, e a tela tinha oferecido.
 *
 * Devolve faixas `{ini, fim, motivo}` já recortadas na janela da grade, para
 * quem desenha não ter de somar, cortar nem ordenar nada.
 *
 * Só serve para pintar. Quem decide se cabe um agendamento é
 * `server/src/lib/availability.js`, e quem valida o arraste é
 * `shared/remarcar.js` — esta função não recusa nada, só mostra.
 */
export function fechadoNoDia({ profissional, data, deMin, ateMin }) {
  const jornada = profissional?.jornada?.[diaDaSemana(data)];
  if (!jornada) return [{ ini: deMin, fim: ateMin, motivo: 'Não atende neste dia' }];

  const [abre, fecha] = [minutos(jornada[0]), minutos(jornada[1])];
  return [
    { ini: deMin, fim: Math.min(abre, ateMin), motivo: `Antes das ${jornada[0]}` },
    { ini: Math.max(fecha, deMin), fim: ateMin, motivo: `Depois das ${jornada[1]}` },
  ].filter(f => f.fim > f.ini);
}

/**
 * Onde a empresa inteira está fechada: antes da primeira pessoa abrir e depois
 * da última fechar, ou o dia todo se ninguém trabalha nele.
 *
 * É a mesma conta do horário que o site publica (`server/src/lib/horarios.js`):
 * a empresa está aberta quando há alguém atendendo, da abertura mais cedo ao
 * fechamento mais tarde. Um buraco no meio do dia em que ninguém atende (todas
 * almoçando na mesma hora) não é "empresa fechada" — cada coluna já mostra a
 * jornada da própria pessoa.
 */
export function fechadoDaEmpresa({ equipe = [], data, deMin, ateMin }) {
  const dia = diaDaSemana(data);
  const faixas = equipe
    .filter(p => p.ativo !== false)
    .map(p => p.jornada?.[dia])
    .filter(j => Array.isArray(j) && j.length === 2);
  if (!faixas.length) return [{ ini: deMin, fim: ateMin, motivo: 'Fechado neste dia' }];

  const abre = Math.min(...faixas.map(j => minutos(j[0])));
  const fecha = Math.max(...faixas.map(j => minutos(j[1])));
  return [
    { ini: deMin, fim: Math.min(abre, ateMin), motivo: 'Fechado' },
    { ini: Math.max(fecha, deMin), fim: ateMin, motivo: 'Fechado' },
  ].filter(f => f.fim > f.ini);
}

/**
 * As faixas de `faixas` sem o pedaço que `cortes` já cobre. Serve para a
 * jornada de uma pessoa não ser pintada duas vezes por cima da empresa
 * fechada — duas listras sobrepostas viram uma mancha que não se lê.
 */
export function semAs(faixas, cortes) {
  let resto = faixas;
  for (const c of cortes) {
    resto = resto.flatMap(f => [
      { ...f, fim: Math.min(f.fim, c.ini) },
      { ...f, ini: Math.max(f.ini, c.fim) },
    ].filter(x => x.fim > x.ini));
  }
  return resto;
}

/** Domingo é 0, como no `Date` e como na jornada gravada. */
const diaDaSemana = data => new Date(data + 'T12:00:00').getDay();

const minutos = hm => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
