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

/** Domingo é 0, como no `Date` e como na jornada gravada. */
const diaDaSemana = data => new Date(data + 'T12:00:00').getDay();

const minutos = hm => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
