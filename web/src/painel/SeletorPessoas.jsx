import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Users } from 'lucide-react';
import { iniciais } from '../shared/tempo.js';

/**
 * De quem são os dados desta tela: todo mundo, uma pessoa, ou algumas.
 *
 * Substitui o `<select>` de antes. O motivo não é enfeite: com a inicial
 * colorida de cada pessoa, a escolha usa a mesma marca que os blocos da agenda
 * e as colunas do gráfico — a cor vira o nome, e a lista deixa de ser texto
 * cinza igual a qualquer outro campo.
 *
 * `multiplo` liga a marcação de vários (a dona olhando Bia + Karen lado a lado).
 * Fica desligado onde o número vem somado do servidor, que recorta uma pessoa
 * por vez — ver `escopoDe` em ARQUITETURA.md.
 *
 * Some para quem não vê a equipe toda. Esconder é conveniência: o servidor
 * ignora o recorte pedido por quem não pode fazê-lo.
 */
export default function SeletorPessoas({
  staff, valor = [], aoMudar, podeVerTodos, multiplo = false, rotuloTodos = 'Todos os profissionais',
}) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef(null);

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = e => { if (!raiz.current?.contains(e.target)) setAberto(false); };
    const esc = e => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  if (!podeVerTodos) return null;
  const ativos = staff.filter(p => p.ativo);
  const marcados = ativos.filter(p => valor.includes(p.id));

  const alternar = p => {
    if (!multiplo) { aoMudar([p.id]); setAberto(false); return; }
    // Desmarcar o último volta para "todos": lista de gente nenhuma mostraria
    // uma agenda vazia, que parece defeito.
    const novo = valor.includes(p.id) ? valor.filter(x => x !== p.id) : [...valor, p.id];
    aoMudar(novo);
  };

  const rotulo = marcados.length === 0 ? rotuloTodos
    : marcados.length === 1 ? marcados[0].nome
    : `${marcados.length} profissionais`;

  return (
    <div className="sp" ref={raiz}>
      <button type="button" className="sp-botao" aria-expanded={aberto} aria-haspopup="listbox"
              onClick={() => setAberto(v => !v)}>
        {marcados.length === 0
          ? <Users size={15} />
          : (
            <span className="sp-fotos">
              {marcados.slice(0, 3).map(p => (
                <span key={p.id} className="avatar sp-foto" style={{ background: p.cor }}>
                  {iniciais(p.nome)}
                </span>
              ))}
            </span>
          )}
        <span className="sp-rotulo">{rotulo}</span>
        <ChevronDown size={15} />
      </button>

      {aberto && (
        <div className="sp-lista" role="listbox" aria-multiselectable={multiplo || undefined}>
          <button type="button" role="option" aria-selected={marcados.length === 0}
                  className={'sp-item' + (marcados.length === 0 ? ' on' : '')}
                  onClick={() => { aoMudar([]); setAberto(false); }}>
            <span className="avatar sp-foto sp-todos"><Users size={13} /></span>
            <span className="sp-nome">{rotuloTodos}</span>
            {marcados.length === 0 && <Check size={15} />}
          </button>

          {ativos.map(p => {
            const on = valor.includes(p.id);
            return (
              <button key={p.id} type="button" role="option" aria-selected={on}
                      className={'sp-item' + (on ? ' on' : '')} onClick={() => alternar(p)}>
                <span className="avatar sp-foto" style={{ background: p.cor }}>{iniciais(p.nome)}</span>
                <span className="sp-nome">
                  {p.nome}
                  {p.funcao && <i>{p.funcao}</i>}
                </span>
                {on && <Check size={15} />}
              </button>
            );
          })}

          {multiplo && (
            <p className="sp-ajuda">Marque quantas quiser. Sem nenhuma, aparece a equipe toda.</p>
          )}
        </div>
      )}
    </div>
  );
}
