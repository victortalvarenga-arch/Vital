import { useEffect, useState } from 'react';
import Cadastro from './Cadastro.jsx';
import Equipe from './Equipe.jsx';

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
export default function App() {
  const [rota, setRota] = useState(() => (location.hash === '#equipe' ? 'equipe' : 'cadastro'));

  useEffect(() => {
    const aoTrocar = () => setRota(location.hash === '#equipe' ? 'equipe' : 'cadastro');
    addEventListener('hashchange', aoTrocar);
    return () => removeEventListener('hashchange', aoTrocar);
  }, []);

  return rota === 'equipe' ? <Equipe /> : <Cadastro />;
}
