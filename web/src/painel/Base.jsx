import { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * As peças que toda tela do painel usa.
 *
 * Moravam dentro do `App.jsx`, e era por isso que nenhuma tela conseguia sair
 * de lá: extrair um componente significava ou arrastar o `App` junto (import
 * circular) ou copiar o `Modal` de novo. O `ROADMAP.md` registrava esse
 * obstáculo desde que `App.jsx` passou de mil linhas.
 */

/** Fecha no Esc. Toda janela sobreposta precisa disso, e ninguém lembra. */
function useEscapeFecha(aoFechar) {
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') aoFechar(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [aoFechar]);
}

/**
 * Gaveta lateral — a forma padrão de abrir alguma coisa por cima da agenda.
 *
 * Um modal centrado tapa a tela inteira: abrir um atendimento escondia a grade
 * que se estava lendo, e fechar era a única forma de voltar a ver o dia. A
 * gaveta entra pela direita e deixa a agenda visível ao lado — dá para conferir
 * o horário de trás enquanto se decide o que fazer com este.
 *
 * No celular vira folha que sobe de baixo, que é o gesto que o telefone já
 * ensina, e ocupa no máximo 92% da altura: o pedaço de tela que sobra em cima é
 * o que avisa que aquilo é uma camada, e não a tela inteira.
 */
export const Gaveta = ({ children, onClose, titulo, largura }) => {
  useEscapeFecha(onClose);
  return (
    <div className="gv-fundo" onClick={onClose}>
      <aside className="gv" role="dialog" aria-modal="true" aria-label={titulo}
             style={largura ? { width: largura } : undefined}
             onClick={e => e.stopPropagation()}>
        <button className="gv-fechar" onClick={onClose} aria-label="Fechar"><X size={20} /></button>
        <div className="gv-corpo">{children}</div>
      </aside>
    </div>
  );
};

/**
 * Confirmação curta, no meio da tela.
 *
 * Fica de propósito no formato antigo: é uma pergunta de uma linha, e o que ela
 * pede é que a pessoa **pare**. Gaveta lateral convida a continuar olhando a
 * agenda; aqui é o contrário.
 */
export const Confirmar = ({ titulo, texto, rotulo, perigo, aoConfirmar, aoFechar }) => {
  useEscapeFecha(aoFechar);
  return (
    <div className="ovl" onClick={aoFechar}>
      <div className="modal cf" role="alertdialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <h2>{titulo}</h2>
        {texto && <p>{texto}</p>}
        <div className="cf-botoes">
          <button className="btn btn-g" onClick={aoFechar}>Voltar</button>
          <button className={'btn ' + (perigo ? 'btn-p btn-perigo' : 'btn-p')}
                  onClick={aoConfirmar}>{rotulo}</button>
        </div>
      </div>
    </div>
  );
};

export const Modal = ({ children, onClose, wide }) => (
  <div className="ovl" onClick={onClose}>
    <div className={'modal' + (wide ? ' wide' : '')} onClick={e => e.stopPropagation()}>
      <button onClick={onClose} aria-label="Fechar"
              style={{ position: 'absolute', top: 16, right: 16, color: 'var(--muted)' }}>
        <X size={20} />
      </button>
      {children}
    </div>
  </div>
);

export const Campo = ({ label, children }) => (
  <div className="mfield"><label>{label}</label>{children}</div>
);

export const Switch = ({ on, onChange }) => (
  <button className={'switch' + (on ? ' on' : '')} onClick={onChange}
          role="switch" aria-checked={on}><i /></button>
);
