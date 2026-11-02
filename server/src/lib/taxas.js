import { escopoDe, pode } from './auth.js';

/**
 * Tira a taxa de comissão alheia do que vai para quem não vê o negócio inteiro.
 *
 * O funcionário enxerga o próprio dinheiro pelo `/relatorios`, já recortado.
 * Mas a TAXA de cada colega — o padrão dela e a exceção de cada uma em cada
 * serviço — saía inteira em `/api/estado`, `/api/servicos` e
 * `/api/profissionais`, para qualquer papel. Fica só a dele.
 *
 * A recepção vê a agenda de todos (`escopoDe` devolve `null`) e não tem
 * `financeiro`: não fica com taxa nenhuma. Decidir só pelo escopo entregaria a
 * ela a tabela inteira de comissões.
 *
 * Um lugar só para as três rotas: recorte escrito em cada uma é recorte que
 * a quarta rota esquece.
 */
function quemVe(usuario) {
  if (!usuario) return { tudo: true };
  const so = escopoDe(usuario);
  if (!pode(usuario.papel, 'financeiro')) return { tudo: false, meu: null };
  return so ? { tudo: false, meu: so } : { tudo: true };
}

export function profissionaisPara(usuario, profissionais) {
  const { tudo, meu } = quemVe(usuario);
  if (tudo) return profissionais;
  return profissionais.map(p => (meu && p.id === meu ? p
    : { ...p, comissao: null, comissaoTipo: null, comissaoFixo: null }));
}

export function servicosPara(usuario, servicos) {
  const { tudo, meu } = quemVe(usuario);
  if (tudo) return servicos;
  return servicos.map(s => ({
    ...s,
    comissao: null,
    comissoes: meu && s.comissoes?.[meu] != null ? { [meu]: s.comissoes[meu] } : {},
  }));
}
