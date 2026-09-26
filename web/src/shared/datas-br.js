/**
 * Data em dd/mm/aaaa — o formato que se lê e se digita no Brasil.
 *
 * O sistema inteiro guarda data como texto `'YYYY-MM-DD'` (ver ARQUITETURA.md);
 * o formato brasileiro só existe na tela. Estas duas funções são a fronteira, e
 * ficam fora do React para poderem ser testadas: o erro que elas evitam — 09/05
 * lido como 9 de maio quando era 5 de setembro — é um agendamento no dia errado.
 */

const pad = n => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' → '25/09/2026'. O que não é data vira vazio. */
export const paraBR = iso => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
};

/**
 * '25/09/2026' → '2026-09-25', ou '' se o dia não existe no calendário.
 *
 * A conferência é necessária porque `new Date(2026, 1, 31)` vira 3 de março
 * caladamente — e aí o agendamento nasce numa data que ninguém escolheu.
 */
export const paraISO = br => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((br || '').trim());
  if (!m) return '';
  const [, d, mes, ano] = m.map(Number);
  const teste = new Date(Date.UTC(ano, mes - 1, d));
  if (teste.getUTCFullYear() !== ano || teste.getUTCMonth() !== mes - 1 || teste.getUTCDate() !== d) return '';
  return `${ano}-${pad(mes)}-${pad(d)}`;
};

/** Vai pondo as barras enquanto se digita, e não deixa passar de 8 dígitos. */
export function comMascara(texto) {
  const d = (texto || '').replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}
