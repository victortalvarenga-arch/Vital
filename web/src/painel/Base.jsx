import { Children, cloneElement, isValidElement, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * As peças que toda tela do painel usa.
 *
 * Moravam dentro do `App.jsx`, e era por isso que nenhuma tela conseguia sair
 * de lá: extrair um componente significava ou arrastar o `App` junto (import
 * circular) ou copiar o `Modal` de novo. O `ROADMAP.md` registrava esse
 * obstáculo desde que `App.jsx` passou de mil linhas.
 */

// Janelas abertas, a de cima por último. Só ela responde ao Esc: com uma
// confirmação aberta sobre a gaveta, um Esc fechava as duas.
const pilha = [];
const FOCAVEIS = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), '
  + 'textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * O que toda janela sobreposta precisa, e ninguém lembra: fechar no Esc, levar
 * o foco para dentro ao abrir, não deixar o Tab sair para a tela de trás, e
 * devolver o foco a quem abriu. Sem isso, quem usa teclado ou leitor de tela
 * não percebe que uma janela abriu.
 *
 * Também dá nome à janela pelo primeiro título dela, quando ninguém deu.
 */
export function useJanela(aoFechar) {
  const ref = useRef(null);
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;

  useEffect(() => {
    const el = ref.current;
    const quemAbriu = document.activeElement;
    pilha.push(el);
    if (el && !el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) {
      const titulo = el.querySelector('h1, h2, h3');
      if (titulo) {
        titulo.id ||= `janela-${Math.random().toString(36).slice(2, 8)}`;
        el.setAttribute('aria-labelledby', titulo.id);
      }
    }
    // A janela em si, e não o primeiro campo: no celular, foco em campo abre
    // o teclado em cima do que a pessoa ia ler. Campo com `autoFocus` já
    // trouxe o foco para dentro, e aí ele fica.
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
    const teclar = e => {
      if (pilha.at(-1) !== el) return;
      if (e.key === 'Escape') { e.stopPropagation(); fechar.current(); return; }
      if (e.key !== 'Tab') return;
      const lista = [...el.querySelectorAll(FOCAVEIS)].filter(x => x.offsetParent !== null);
      if (!lista.length) return;
      const [primeiro, ultimo] = [lista[0], lista.at(-1)];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    };
    document.addEventListener('keydown', teclar);
    return () => {
      document.removeEventListener('keydown', teclar);
      pilha.splice(pilha.indexOf(el), 1);
      if (quemAbriu?.isConnected) quemAbriu.focus({ preventScroll: true });
    };
  }, []);

  return ref;
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
  const ref = useJanela(onClose);
  return (
    <div className="gv-fundo" onClick={onClose}>
      <aside ref={ref} tabIndex={-1} className="gv" role="dialog" aria-modal="true" aria-label={titulo}
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
  const ref = useJanela(aoFechar);
  return (
    <div className="ovl" onClick={aoFechar}>
      <div ref={ref} tabIndex={-1} className="modal cf" role="alertdialog" aria-modal="true"
           onClick={e => e.stopPropagation()}>
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

export const Modal = ({ children, onClose, wide }) => {
  const ref = useJanela(onClose);
  return (
    <div className="ovl" onClick={onClose}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true"
           className={'modal' + (wide ? ' wide' : '')} onClick={e => e.stopPropagation()}>
        {/* `type="button"`: o modal pode abrir dentro de um formulário (o link
            de acesso sai da ficha da profissional), e fechar não pode salvar. */}
        <button type="button" onClick={onClose} aria-label="Fechar"
                style={{ position: 'absolute', top: 16, right: 16, color: 'var(--muted)' }}>
          <X size={20} />
        </button>
        {children}
      </div>
    </div>
  );
};

const NATIVOS = new Set(['input', 'select', 'textarea']);

/**
 * Liga um rótulo ao que ele nomeia. Com um campo nativo só, o `<label>`
 * aponta para ele (`htmlFor`), e clicar no rótulo leva ao campo. Com qualquer
 * outra coisa — um seletor nosso, um grupo de botões — o rótulo vira o nome
 * do grupo. Sem isso, o leitor de tela lia cada campo do painel sem nome.
 */
export function useRotulo(children) {
  const id = useId();
  const filho = Children.count(children) === 1 && isValidElement(children) ? children : null;
  // Componente nosso que repassa `id` ao campo dele (`recebeId`) vale como nativo.
  if (filho && (NATIVOS.has(filho.type) || filho.type?.recebeId)) {
    const alvo = filho.props.id || id;
    return { rotulo: { htmlFor: alvo }, grupo: {}, filhos: filho.props.id ? filho : cloneElement(filho, { id }) };
  }
  return { rotulo: { id }, grupo: { role: 'group', 'aria-labelledby': id }, filhos: children };
}

export const Campo = ({ label, children }) => {
  const { rotulo, grupo, filhos } = useRotulo(children);
  return <div className="mfield" {...grupo}><label {...rotulo}>{label}</label>{filhos}</div>;
};

/** `rotulo` é o nome da chave para quem não vê a tela; sem um texto ao lado
 *  que a nomeie (label em volta), ele é obrigatório. */
export const Switch = ({ on, onChange, rotulo }) => (
  <button className={'switch' + (on ? ' on' : '')} onClick={onChange}
          role="switch" aria-checked={on} aria-label={rotulo}><i /></button>
);
