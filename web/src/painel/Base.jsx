import { X } from 'lucide-react';

/**
 * As três peças que toda tela do painel usa.
 *
 * Moravam dentro do `App.jsx`, e era por isso que nenhuma tela conseguia sair
 * de lá: extrair um componente significava ou arrastar o `App` junto (import
 * circular) ou copiar o `Modal` de novo. O `ROADMAP.md` registrava esse
 * obstáculo desde que `App.jsx` passou de mil linhas.
 */

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
