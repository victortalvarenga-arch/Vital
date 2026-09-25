import { addDias } from './tempo.js';

/**
 * O período do Financeiro: qual filtro está ligado, e o que as setas fazem.
 *
 * Tudo aqui é conta com texto 'YYYY-MM-DD', nunca `Date` — mês e ano navegam
 * pelo primeiro dia, sem estourar em 31 de fevereiro nem depender de fuso. E
 * nada aqui toca em React: é o que dá para testar sem abrir a tela.
 *
 * Os períodos são os do calendário, não janelas deslizantes: "Semana" é a
 * semana em que se está (domingo a sábado, como a agenda do painel), não os
 * últimos sete dias. É assim que a dona compara — "esta semana contra a
 * passada" —, e "últimos 30 dias" ao lado de "Mês" seriam duas respostas
 * ligeiramente diferentes para a mesma pergunta.
 *
 * O estado é `{ filtro, ancora, custom }`, onde `ancora` é qualquer dia dentro
 * do período (o dia, a semana, o mês ou o ano), e `custom` vale `{ de, ate }`,
 * com as setas paradas.
 */

export const FILTROS = [
  { k: 'hoje', rotulo: 'Hoje' },
  { k: 'semana', rotulo: 'Semana' },
  { k: 'mes', rotulo: 'Mês' },
  { k: 'ano', rotulo: 'Ano' },
  { k: 'custom', rotulo: 'Personalizado' },
];

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

const pad = n => String(n).padStart(2, '0');
const partes = iso => iso.split('-').map(Number);
const primeiroDoMes = iso => `${iso.slice(0, 7)}-01`;

/** Último dia do mês — dia 0 do mês seguinte, em UTC para não escorregar de fuso. */
const ultimoDoMes = iso => {
  const [a, m] = partes(iso);
  return `${a}-${pad(m)}-${pad(new Date(Date.UTC(a, m, 0)).getUTCDate())}`;
};

/** Primeiro dia do mês `n` meses depois (ou antes) do de `iso`. */
const somaMeses = (iso, n) => {
  const [a, m] = partes(iso);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}-01`;
};

const diasEntre = (de, ate) =>
  Math.round((new Date(`${ate}T12:00:00Z`) - new Date(`${de}T12:00:00Z`)) / 864e5);

/** O domingo da semana de `iso` — o mesmo recorte da agenda semanal do painel. */
const domingoDe = iso => addDias(iso, -new Date(`${iso}T12:00:00`).getDay());

export const estadoInicial = (filtro, hoje) => ({ filtro, ancora: hoje, custom: null });

/** De onde a onde vai o período. */
export function intervaloDe(estado, hoje) {
  const { filtro, ancora, custom } = estado;
  if (filtro === 'custom') return custom || { de: hoje, ate: hoje };
  if (filtro === 'hoje') return { de: ancora, ate: ancora };
  if (filtro === 'semana') {
    const domingo = domingoDe(ancora);
    return { de: domingo, ate: addDias(domingo, 6) };
  }
  if (filtro === 'mes') return { de: primeiroDoMes(ancora), ate: ultimoDoMes(ancora) };
  const ano = partes(ancora)[0]; // 'ano'
  return { de: `${ano}-01-01`, ate: `${ano}-12-31` };
}

/** Não se navega para o futuro: dinheiro que ainda não entrou não tem o que mostrar. */
export function podeAvancar(estado, hoje) {
  const { filtro, ancora } = estado;
  if (filtro === 'custom') return false;
  if (filtro === 'semana') return domingoDe(ancora) < domingoDe(hoje);
  if (filtro === 'mes') return primeiroDoMes(ancora) < primeiroDoMes(hoje);
  if (filtro === 'ano') return partes(ancora)[0] < partes(hoje)[0];
  return ancora < hoje;
}

/** As setas: -1 anda um período para trás, +1 para a frente. Personalizado não sai do lugar. */
export function deslocar(estado, passo, hoje) {
  const { filtro, ancora } = estado;
  if (filtro === 'custom') return estado;
  if (passo > 0 && !podeAvancar(estado, hoje)) return estado;

  let nova;
  if (filtro === 'hoje') nova = addDias(ancora, passo);
  else if (filtro === 'semana') nova = addDias(domingoDe(ancora), passo * 7);
  else if (filtro === 'mes') nova = somaMeses(ancora, passo);
  else nova = `${partes(ancora)[0] + passo}-01-01`;

  return { ...estado, ancora: nova };
}

/**
 * Em que degrau o gráfico desenha: hora, dia ou mês. Um dia só é lido por hora;
 * até dois meses, por dia; além disso, por mês — 300 colunas não se leem.
 */
export function degrauDe(estado, hoje) {
  const { filtro } = estado;
  if (filtro === 'hoje') return 'hora';
  if (filtro === 'ano') return 'mes';
  if (filtro !== 'custom') return 'dia';
  const { de, ate } = intervaloDe(estado, hoje);
  const dias = diasEntre(de, ate) + 1;
  return dias === 1 ? 'hora' : dias <= 62 ? 'dia' : 'mes';
}

const dataCurta = iso => { const [, m, d] = partes(iso); return `${d} de ${MESES[m - 1]}`; };
const dataComAno = iso => `${dataCurta(iso)} de ${partes(iso)[0]}`;

/** O título do período, do jeito que se diz em voz alta. */
export function tituloDe(estado, hoje) {
  const { filtro, ancora } = estado;
  if (filtro === 'hoje') {
    if (ancora === hoje) return 'Hoje';
    if (ancora === addDias(hoje, -1)) return 'Ontem';
    const dia = DIAS[new Date(`${ancora}T12:00:00`).getDay()];
    return `${dia[0].toUpperCase()}${dia.slice(1)}, ${dataCurta(ancora)}`;
  }
  if (filtro === 'semana') {
    const domingo = domingoDe(ancora);
    if (domingo === domingoDe(hoje)) return 'Esta semana';
    if (domingo === addDias(domingoDe(hoje), -7)) return 'Semana passada';
    return 'Semana';
  }
  if (filtro === 'mes') {
    const [a, m] = partes(ancora);
    return `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} ${a}`;
  }
  if (filtro === 'ano') return String(partes(ancora)[0]);
  return 'Personalizado';
}

/**
 * O intervalo escrito por extenso: "1 de setembro — 30 de setembro". O ano só
 * aparece quando faz diferença — outro ano que não o de hoje, ou um período que
 * atravessa a virada.
 */
export function intervaloPorExtenso(de, ate, hoje) {
  const anoDe = partes(de)[0];
  const anoAte = partes(ate)[0];
  const comAno = anoDe !== anoAte || anoDe !== partes(hoje)[0];
  const f = comAno ? dataComAno : dataCurta;
  return de === ate ? f(de) : `${f(de)} — ${f(ate)}`;
}
