// Uma cor só, em seis tons — o vinho da marca do painel. Cada pessoa e cada
// categoria se distingue pelo tom, não pelo matiz: a tela ficava um arco-íris.
// A ordem é a de maior contraste entre vizinhos (meio, escuro, claro, ...), para
// as três primeiras pessoas já saírem bem diferentes; todos passam de 4,5:1
// contra o branco das iniciais.
export const PALETA = ['#A32A4E', '#59182B', '#C2476C', '#711E37', '#B03B5E', '#892443'];

/**
 * Cor de uma categoria, deduzida do nome.
 *
 * Era um mapa fixo — 'Unhas', 'Olhar', 'Facial', 'Corpo' —, e categoria de fora
 * dessa lista caía num cinza. Barbearia, clínica e petshop ficavam todas com o
 * mesmo cinza, e cada ramo novo pedia uma linha aqui.
 *
 * A cor sai de um resumo do próprio nome, então é estável (a mesma categoria
 * tem sempre a mesma cor) sem depender de ninguém cadastrar nada. A paleta é a
 * mesma das profissionais: uma só para o painel inteiro.
 */
export const corDaCategoria = nome => {
  let n = 0;
  for (const c of String(nome || '')) n = (n * 31 + c.codePointAt(0)) % 100003;
  return PALETA[n % PALETA.length];
};
