import { useEffect, useRef, useState } from 'react';
import Inicio from './Inicio.jsx';
import Equipe from './Equipe.jsx';
import Legal from './Legal.jsx';

/**
 * A página da Vital. Duas coisas muito diferentes, no mesmo bundle:
 *
 *  - a **porta de entrada do produto**, onde uma empresa se cadastra sozinha;
 *  - o **back-office**, onde a nossa equipe vê as empresas-cliente.
 *
 * Juntas porque as duas são nossas — falam da nossa marca, nunca da marca de
 * uma empresa-cliente —, e porque nenhuma delas é servida no endereço de
 * ninguém. Separadas do painel e do site pelo motivo de sempre: quem abre um
 * não baixa o código do outro.
 *
 * O `#equipe` no endereço é o que troca entre as duas. Não é segurança — o
 * back-office recusa sem sessão, no servidor. É só para o link ser copiável.
 */
// Os endereços com página própria; qualquer outro (inclusive as âncoras da
// página de apresentação, como `#criar`) fica na apresentação.
const PAGINAS = { '#equipe': 'equipe', '#termos': 'termos', '#privacidade': 'privacidade' };
const paginaAtual = () => PAGINAS[location.hash] || 'inicio';

export default function App() {
  const [rota, setRota] = useState(paginaAtual);

  useEffect(() => {
    const aoTrocar = () => setRota(paginaAtual());
    addEventListener('hashchange', aoTrocar);
    return () => removeEventListener('hashchange', aoTrocar);
  }, []);

  // Página nova abre no topo. Só quando a página muda: âncora dentro da
  // apresentação (`#criar`) também dispara `hashchange`, e voltar ao topo
  // ali desfaria o pulo que o link pediu.
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    window.scrollTo(0, 0);
  }, [rota]);

  if (rota === 'equipe') return <Equipe />;
  if (rota === 'termos' || rota === 'privacidade') return <Legal qual={rota} />;
  return <Inicio />;
}
