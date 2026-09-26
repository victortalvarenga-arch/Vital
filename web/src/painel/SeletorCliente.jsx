import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

const soDigitos = s => (s || '').replace(/\D/g, '');

/** Sem acento e sem caixa: "joao" acha "João". */
const chave = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const fmtFone = s => {
  const d = soDigitos(s).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

/** Quantas sugestões aparecem de uma vez. Rolar dentro de um modal é ruim. */
const LIMITE = 8;

/**
 * Escolher a cliente escrevendo o nome.
 *
 * Era um `<select>` com a lista inteira. Funciona com trinta clientes; com
 * trezentas, achar "Mariana" é rolar uma parede de nomes — e o produto é feito
 * para a empresa que cresce, não para a do seed. Aqui se digita e a lista
 * encolhe, por nome ou pelos dígitos do WhatsApp (duas "Marias" só se
 * distinguem pelo número).
 *
 * Feito à mão, e não com `<datalist>`: o datalist não deixa mostrar o telefone
 * embaixo do nome, cada navegador desenha de um jeito, e no celular alguns
 * simplesmente não abrem.
 *
 * Teclado e toque valem igual: setas e Enter para quem está no balcão com
 * teclado, alvos de 44px para quem está no celular.
 */
export default function SeletorCliente({ clientes, valor, aoMudar, autoFoco }) {
  const escolhida = clientes.find(c => c.id === valor);
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);
  const [marcado, setMarcado] = useState(0);
  const raiz = useRef(null);
  const campo = useRef(null);

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = e => { if (!raiz.current?.contains(e.target)) setAberto(false); };
    document.addEventListener('pointerdown', fora);
    return () => document.removeEventListener('pointerdown', fora);
  }, [aberto]);

  const achados = useMemo(() => {
    const q = chave(busca.trim());
    const digitos = soDigitos(busca);
    if (!q) return clientes.slice(0, LIMITE);
    return clientes.filter(c =>
      chave(c.nome).includes(q) || (digitos && soDigitos(c.fone).includes(digitos))
    ).slice(0, LIMITE);
  }, [clientes, busca]);

  const escolher = c => {
    aoMudar(c.id);
    setBusca('');
    setAberto(false);
  };

  const teclas = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setAberto(true);
      setMarcado(m => {
        const n = achados.length;
        if (!n) return 0;
        return (m + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      });
    } else if (e.key === 'Enter') {
      // Não deixa o Enter enviar o formulário enquanto a lista está aberta:
      // quem digita o nome e aperta Enter quer escolher, não salvar.
      if (aberto && achados[marcado]) { e.preventDefault(); escolher(achados[marcado]); }
    } else if (e.key === 'Escape') {
      setAberto(false);
    }
  };

  // Já escolhida: mostra quem é, com um jeito de trocar. Deixar o nome dentro do
  // campo de busca faria a próxima letra digitada apagar a escolha sem avisar.
  if (escolhida) {
    return (
      <div className="sc-escolhida">
        <span className="sc-nome">
          {escolhida.nome}
          {escolhida.fone && <i>{fmtFone(escolhida.fone)}</i>}
        </span>
        <button type="button" className="sc-trocar" onClick={() => {
          aoMudar('');
          setBusca('');
          // O foco volta para o campo: trocar de cliente é digitar de novo.
          setTimeout(() => campo.current?.focus(), 0);
        }}>
          <X size={14} /> Trocar
        </button>
      </div>
    );
  }

  return (
    <div className="sc" ref={raiz}>
      <Search size={16} className="sc-lupa" />
      <input
        ref={campo}
        type="text"
        role="combobox"
        aria-expanded={aberto}
        aria-autocomplete="list"
        autoFocus={autoFoco}
        placeholder={clientes.length ? 'Escreva o nome ou o WhatsApp' : 'Nenhuma cliente cadastrada'}
        disabled={!clientes.length}
        value={busca}
        onChange={e => { setBusca(e.target.value); setAberto(true); setMarcado(0); }}
        onFocus={() => setAberto(true)}
        // O clique também abre: a janela já entrega o campo focado, e aí focar
        // de novo não dispara evento nenhum — clicar parecia morto.
        onClick={() => setAberto(true)}
        onKeyDown={teclas}
      />

      {aberto && (
        <div className="sc-lista" role="listbox">
          {achados.length === 0 && (
            <p className="sc-nada">Nenhuma cliente com esse nome ou número.</p>
          )}
          {achados.map((c, i) => (
            <button key={c.id} type="button" role="option" aria-selected={i === marcado}
                    className={'sc-item' + (i === marcado ? ' marcado' : '')}
                    onMouseEnter={() => setMarcado(i)}
                    onClick={() => escolher(c)}>
              <b>{c.nome}</b>
              {c.fone && <i>{fmtFone(c.fone)}</i>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
