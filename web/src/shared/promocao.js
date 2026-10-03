/**
 * Quando uma promoção vale, por extenso — "Às terças · até 15/10".
 *
 * Em `shared/` porque o site e o painel precisam dizer a mesma frase: a
 * cliente lê no cartão a regra que a equipe configurou, e duas redações da
 * mesma regra são o começo de "mas no site dizia outra coisa". Não fala com a
 * API, então o site pode importar sem levar nada do painel junto.
 *
 * As regras em si (período e dias olham a data do ATENDIMENTO) estão na
 * migration 021; aqui é só o texto.
 */

const PLURAL = ['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados'];

/** 'YYYY-MM-DD' → 'DD/MM'. */
export const dataCurta = iso => `${iso.slice(8)}/${iso.slice(5, 7)}`;

/** [2] → "Às terças"; [1..5] → "De segunda a sexta"; vazio ou todos → "". */
export function diasPorExtenso(dias) {
  if (!dias?.length || dias.length === 7) return '';
  // Segunda primeiro, domingo por último: é como a semana se lê no balcão.
  const ord = [...new Set(dias)].sort((a, b) => (a || 7) - (b || 7));
  const k = ord.join();
  if (k === '1,2,3,4,5') return 'De segunda a sexta';
  if (k === '1,2,3,4,5,6') return 'De segunda a sábado';
  if (k === '6,0') return 'Nos fins de semana';
  if (ord.length === 1) return (ord[0] === 0 || ord[0] === 6 ? 'Aos ' : 'Às ') + PLURAL[ord[0]];
  const nomes = ord.map(d => PLURAL[d]);
  const lista = nomes.slice(0, -1).join(', ') + ' e ' + nomes.at(-1);
  return lista[0].toUpperCase() + lista.slice(1);
}

/** Período por extenso, ou "" quando não há data nenhuma. */
export function periodoPorExtenso({ validoDe, validoAte }) {
  if (validoDe && validoAte) return `${dataCurta(validoDe)} a ${dataCurta(validoAte)}`;
  if (validoAte) return `até ${dataCurta(validoAte)}`;
  if (validoDe) return `a partir de ${dataCurta(validoDe)}`;
  return '';
}

/** As duas coisas juntas, para uma linha só no cartão. */
export const quandoVale = c =>
  [diasPorExtenso(c.diasSemana), periodoPorExtenso(c)].filter(Boolean).join(' · ');
