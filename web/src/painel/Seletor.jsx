/**
 * Escolher de quem são os números: a equipe inteira, ou uma pessoa.
 *
 * Era uma fila de chips, um por profissional. Funciona com três; com vinte,
 * vira uma parede de botões que empurra o resto da tela para baixo e ainda
 * quebra em várias linhas — e a pergunta "de quem?" some no meio dela.
 *
 * `<select>` nativo, e não um menu próprio: ele rola sozinho por mais longa que
 * seja a lista, anda por teclado sem código nenhum, e no celular abre o seletor
 * do sistema — que é o que a pessoa já sabe usar. Este painel é mobile-first e
 * vai virar app (Capacitor); um dropdown de fabricação própria perderia as três
 * coisas de uma vez.
 *
 * Some para quem não vê a equipe toda. Esconder é conveniência: o servidor
 * ignora o recorte pedido por quem não pode fazê-lo.
 */
export default function SeletorProfissional({ staff, valor, aoMudar, podeVerTodos, rotuloTodos = 'A equipe toda' }) {
  if (!podeVerTodos) return null;
  const ativos = staff.filter(p => p.ativo);
  return (
    <label className="sel-prof">
      <span className="sel-prof-rotulo">Vendo</span>
      <select value={valor} onChange={e => aoMudar(e.target.value)}>
        <option value="">{rotuloTodos}</option>
        {ativos.map(p => (
          <option key={p.id} value={p.id}>{p.nome}</option>
        ))}
      </select>
    </label>
  );
}
