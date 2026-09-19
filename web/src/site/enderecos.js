/**
 * Onde a empresa atende, do jeito que o site mostra.
 *
 * Uma fonte de verdade só. Com mais de uma unidade cadastrada, os endereços
 * são os DELAS — o `endereco` da config deixa de aparecer, porque é o caso em
 * que ele contradiz a janela de agendamento ("Rua X" no hero, "Centro / Zona
 * Sul" na escolha de unidade), e cliente que vê dois endereços diferentes
 * desconfia do negócio inteiro. Com uma unidade ou nenhuma, vale a config,
 * como sempre valeu: empresa de um endereço só não paga nada por unidades.
 *
 * O limiar é o mesmo que decide se o passo de unidade aparece no agendamento
 * (`util('unidade')` em Agendar.jsx): a página e a janela concordam sempre.
 */

const linkMapa = endereco => `https://maps.google.com/?q=${encodeURIComponent(endereco)}`;

/** @returns {{ id: string|null, nome: string, endereco: string, mapa: string }[]} */
export function lugares({ negocio, unidades }) {
  const comEndereco = (unidades || []).filter(u => u.endereco);
  if (comEndereco.length > 1) {
    return comEndereco.map(u => ({
      id: u.id, nome: u.nome, endereco: u.endereco, mapa: u.mapa || linkMapa(u.endereco),
    }));
  }
  if (!negocio?.endereco) return [];
  return [{ id: null, nome: '', endereco: negocio.endereco, mapa: negocio.mapa || linkMapa(negocio.endereco) }];
}

/** O endereço de uma unidade específica, quando a cliente já escolheu uma. */
export function lugarDaUnidade(dados, unidadeId) {
  // Sem unidade não há o que achar — e o endereço da config tem `id: null`,
  // que um `find` com nulo acharia por engano.
  if (!unidadeId) return null;
  return lugares(dados).find(l => l.id === unidadeId) || null;
}
