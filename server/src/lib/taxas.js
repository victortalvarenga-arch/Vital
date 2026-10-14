import { escopoDe } from './auth.js';

/**
 * Tira a taxa de comissão alheia do que vai para quem não vê o negócio inteiro.
 *
 * O funcionário enxerga o próprio dinheiro pelo `/relatorios`, já recortado.
 * Mas a TAXA de cada colega — o padrão dela e a exceção de cada uma em cada
 * serviço — saía inteira em `/api/estado`, `/api/servicos` e
 * `/api/profissionais`, para qualquer papel. Fica só a dele.
 *
 * Um lugar só para as três rotas: recorte escrito em cada uma é recorte que
 * a quarta rota esquece.
 */
export function profissionaisPara(usuario, profissionais) {
  const so = escopoDe(usuario);
  if (!so) return profissionais;
  return profissionais.map(p => (p.id === so ? p
    : { ...p, comissao: null, comissaoTipo: null, comissaoFixo: null }));
}

export function servicosPara(usuario, servicos) {
  const so = escopoDe(usuario);
  if (!so) return servicos;
  return servicos.map(s => ({
    ...s,
    comissao: null,
    comissoes: s.comissoes?.[so] != null ? { [so]: s.comissoes[so] } : {},
  }));
}
