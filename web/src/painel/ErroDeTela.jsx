import { Component } from 'react';
import { TriangleAlert } from 'lucide-react';

/**
 * Segura o erro de uma tela para ele não apagar o painel inteiro.
 *
 * Sem isto, uma exceção ao desenhar qualquer tela desmonta a árvore toda do
 * React e sobra uma página em branco — sem menu, sem aviso, só um erro no
 * console que ninguém tem aberto. Foi assim que o "Encaixe" passou semanas
 * "não fazendo nada": um `ReferenceError` no formulário sumia com o Calendário.
 *
 * Fica em volta do conteúdo, não do painel: o menu continua de pé e a pessoa
 * vai para outra tela. `key` com o nome da tela em `App.jsx` zera o erro ao
 * trocar de tela.
 */
export default class ErroDeTela extends Component {
  state = { erro: null };

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro, info) {
    console.error('[tela]', erro, info?.componentStack);
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="et" role="alert">
        <TriangleAlert size={30} aria-hidden="true" />
        <h2>Esta tela falhou</h2>
        <p>
          Nada do que já estava salvo se perdeu. Recarregue a página; se continuar,
          abra um chamado em Suporte técnico contando o que você estava fazendo.
        </p>
        <button className="btn btn-p" onClick={() => window.location.reload()}>Recarregar</button>
        <p className="p-fraco et-detalhe">{String(this.state.erro?.message || this.state.erro).slice(0, 200)}</p>
      </div>
    );
  }
}
