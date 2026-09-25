/** Até onde vai o eixo: o próximo número redondo acima do maior valor. */
export function tetoDoEixo(maior) {
  if (maior <= 0) return 100;
  const base = 10 ** Math.floor(Math.log10(maior));
  const f = maior / base;
  return base * (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10);
}

/**
 * O valor escrito em cima de uma coluna. Sem "R$" — o título do gráfico já diz
 * que é dinheiro, e o símbolo repetido doze vezes é ruído. Os centavos só
 * aparecem quando existem.
 */
export const rotuloDeValor = v => (v % 1 === 0
  ? v.toLocaleString('pt-BR')
  : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** Rótulo curto do eixo: 1,5 mil, 200, 0. */
export const compacto = n => (n >= 1000
  ? `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  : n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
