/**
 * Contas de hora e data, compartilhadas entre as telas do painel.
 *
 * Vive em `shared/` pelo mesmo motivo de `formato.js`: mais de uma tela
 * precisa da mesma conta, e duplicá-la é a próxima divergência de fuso ou
 * arredondamento esperando acontecer — a Agenda e o Resumo desenham a
 * própria grade de horário em cima destas mesmas funções.
 *
 * Este módulo não fala com a API.
 */

/** 'HH:MM' → minutos desde a meia-noite. */
export const toMin = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };

/** Minutos desde a meia-noite → 'HH:MM'. */
export const toHora = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Data de hoje, 'YYYY-MM-DD', no fuso do navegador de quem está com o painel aberto. */
export const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Iniciais de um nome, até duas letras — para o avatar redondo. */
export const iniciais = n => n.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();

/**
 * Distribui lado a lado o que se sobrepõe.
 *
 * Empilhar um atendimento por cima do outro esconde atendimento, que é o pior
 * defeito que uma agenda pode ter — some da tela sem nenhum sinal, e quem
 * olha conclui que o horário está livre.
 *
 * O algoritmo é o de calendário: agrupa quem se cruza, e dentro do grupo cada
 * um entra na primeira faixa livre. A largura é dividida pelo tamanho do
 * grupo, então dois simultâneos ficam com metade cada.
 *
 * Recebe e devolve `{ ini, fim, ... }` em minutos; acrescenta `faixa` (qual
 * das colunas) e `faixas` (quantas ao todo). Não sabe nada de pixel: quem
 * desenha decide o que fazer com os dois números.
 */
export function emFaixas(itens) {
  const ordenados = [...itens].sort((a, b) => a.ini - b.ini || a.fim - b.fim);
  const saida = [];
  let grupo = [], fimDoGrupo = -1;

  const fechar = () => {
    const ultimoDaFaixa = [];
    for (const it of grupo) {
      let f = ultimoDaFaixa.findIndex(fim => fim <= it.ini);
      if (f === -1) f = ultimoDaFaixa.length;
      ultimoDaFaixa[f] = it.fim;
      it.faixa = f;
    }
    for (const it of grupo) it.faixas = ultimoDaFaixa.length;
    saida.push(...grupo);
    grupo = []; fimDoGrupo = -1;
  };

  for (const it of ordenados) {
    if (grupo.length && it.ini >= fimDoGrupo) fechar();
    grupo.push(it);
    fimDoGrupo = Math.max(fimDoGrupo, it.fim);
  }
  if (grupo.length) fechar();
  return saida;
}

/**
 * De que hora a que hora a grade precisa ir para caber tudo.
 *
 * Começa no horário comercial (8h–20h) e só se estica quando há atendimento
 * fora dele. A grade fixa escondia silenciosamente quem marcasse às 7h — o
 * bloco ganhava `top` negativo e o `overflow: hidden` da moldura cortava.
 * Pior: os contadores do topo continuavam contando, então a mesma tela dizia
 * "3 atendimentos" e desenhava 2.
 */
export function faixaDeHoras(agendamentos, ini = 8, fim = 20) {
  for (const a of agendamentos) {
    const comeca = Math.floor(toMin(a.hora) / 60);
    const termina = Math.ceil((toMin(a.hora) + (a.duracao || 0)) / 60);
    if (comeca < ini) ini = comeca;
    if (termina > fim) fim = termina;
  }
  return [Math.max(0, ini), Math.min(24, fim)];
}

/** 'YYYY-MM-DD' mais (ou menos) N dias. */
export const addDias = (iso, n) => {
  // Meio-dia, não meia-noite: somar dia sobre 00:00 erra na virada do horário
  // de verão, onde o dia tem 23 ou 25 horas.
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * O intervalo de um período, a partir da escala e de quantos passos para trás.
 *
 * `desloc` é relativo: 0 é o período de agora, -1 o anterior, +1 o seguinte.
 * A semana vai de domingo a sábado — é o calendário que o Brasil lê, e é o
 * mesmo recorte da agenda semanal do painel.
 */
export function intervaloDo(escala, desloc = 0, base = hojeISO()) {
  if (escala === 'dia') {
    const d = addDias(base, desloc);
    return { de: d, ate: d };
  }
  if (escala === 'semana') {
    const b = new Date(base + 'T12:00:00');
    const domingo = addDias(base, -b.getDay() + desloc * 7);
    return { de: domingo, ate: addDias(domingo, 6) };
  }
  const b = new Date(base + 'T12:00:00');
  const primeiro = new Date(b.getFullYear(), b.getMonth() + desloc, 1);
  const ultimo = new Date(b.getFullYear(), b.getMonth() + desloc + 1, 0);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { de: iso(primeiro), ate: iso(ultimo) };
}
