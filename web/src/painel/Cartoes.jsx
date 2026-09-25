import { useEffect, useRef, useState } from 'react';

/** Um número do topo. Enquanto o período não chega, ocupa o mesmo espaço. */
export const Numero = ({ rotulo, valor, dica, extra }) => (
  <div className="card stat">
    <span className="eyebrow">{rotulo}</span>
    <span className="v">{valor == null ? <span className="rs-esperando">—</span> : valor}</span>
    {extra}
    {dica && <Dica texto={dica} />}
  </div>
);

/**
 * O "!" no canto de um cartão: uma frase dizendo o que o número quer dizer.
 *
 * Abre no toque, não no hover — o painel roda no celular, e dica que só existe
 * com o mouse em cima não existe. Fecha tocando fora ou com Esc. O texto se
 * posiciona contra o cartão (o pai é `position: relative`), não contra o botão,
 * para nunca vazar da tela numa coluna estreita.
 */
export function Dica({ texto }) {
  const [aberta, setAberta] = useState(false);
  const raiz = useRef(null);

  useEffect(() => {
    if (!aberta) return undefined;
    const fora = e => { if (!raiz.current?.contains(e.target)) setAberta(false); };
    const esc = e => { if (e.key === 'Escape') setAberta(false); };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberta]);

  return (
    <span ref={raiz} className="rs-dica">
      <button type="button" className="rs-info" aria-label="O que significa?"
              aria-expanded={aberta} onClick={() => setAberta(v => !v)}>!</button>
      {aberta && <span role="tooltip" className="rs-dica-texto">{texto}</span>}
    </span>
  );
}
