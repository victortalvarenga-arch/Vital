/**
 * O horário de funcionamento do negócio, como o site publica.
 *
 * **É derivado da jornada de quem atende, não um campo à parte.** O negócio
 * está aberto quando há alguém trabalhando — e um campo próprio na config
 * nasceria contradizendo a agenda no dia em que a empresa mudasse a jornada de
 * alguém e esquecesse de mexer no site. Mesmo princípio do endereço (ver
 * "Unidades" em ARQUITETURA.md): uma fonte de verdade só.
 *
 * A faixa de cada dia vai da abertura mais cedo ao fechamento mais tarde da
 * equipe inteira. Com duas unidades de horários diferentes, isso junta as duas
 * numa faixa só — aceitável enquanto o site mostra um horário por negócio;
 * quando mostrar por unidade, esta função ganha o recorte.
 *
 * @param {{jornada?: Record<string, [string, string]>}[]} equipe  staff ativo
 * @returns {{dia: number, abre: string, fecha: string}[]} domingo = 0, em ordem
 */
export function horariosDeAtendimento(equipe = []) {
  const porDia = new Map();

  for (const pessoa of equipe) {
    for (const [dia, faixa] of Object.entries(pessoa.jornada || {})) {
      // Jornada vem de JSON gravado pelo painel: uma linha torta não pode
      // derrubar a página inteira do negócio.
      if (!Array.isArray(faixa) || faixa.length !== 2) continue;
      const [abre, fecha] = faixa;
      if (!hora(abre) || !hora(fecha) || fecha <= abre) continue;

      const atual = porDia.get(dia);
      // 'HH:MM' com zero à esquerda compara como texto na ordem do relógio.
      porDia.set(dia, atual
        ? [abre < atual[0] ? abre : atual[0], fecha > atual[1] ? fecha : atual[1]]
        : [abre, fecha]);
    }
  }

  return [0, 1, 2, 3, 4, 5, 6]
    .filter(d => porDia.has(String(d)))
    .map(d => ({ dia: d, abre: porDia.get(String(d))[0], fecha: porDia.get(String(d))[1] }));
}

const hora = v => typeof v === 'string' && /^\d{2}:\d{2}$/.test(v);
