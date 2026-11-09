import { useRef, useState } from 'react';
import { Pencil, Send } from 'lucide-react';
import { api } from '../shared/painel-api.js';
import { fmtData, iniciais } from '../shared/tempo.js';

/** O ciclo muda por ramo: 30 dias numa barbearia é muito, numa clínica é pouco. */
function PrazoDaLista({ prazo, aoSalvar, aviso }) {
  const [dias, setDias] = useState(String(prazo));
  const [erro, setErro] = useState('');
  const campo = useRef(null);

  const salvar = async (e) => {
    e.preventDefault();
    const n = Number(dias);
    if (!Number.isInteger(n) || n < 7 || n > 730) {
      setErro('Use um número de 7 a 730 dias');
      campo.current?.focus();
      return;
    }
    try {
      await api.prazoRecuperacao(n);
      aviso(`Lista atualizada: ${n} dias sem voltar`);
      aoSalvar();
    } catch (falha) { setErro(falha.message); }
  };

  return (
    <form className="rcp-prazo" onSubmit={salvar} noValidate>
      <label htmlFor="rcp-dias">Sem voltar há</label>
      <input id="rcp-dias" ref={campo} type="number" inputMode="numeric" value={dias}
        aria-invalid={!!erro} aria-describedby={erro ? 'rcp-dias-erro' : undefined}
        onChange={e => { setDias(e.target.value); setErro(''); }} />
      <span>dias</span>
      <button className="btn btn-g btn-s">Aplicar</button>
      {erro && <p id="rcp-dias-erro" className="flm-erro">{erro}</p>}
    </form>
  );
}

/**
 * Quem faz tempo que não volta.
 *
 * Fica longe da fila de propósito: a fila é o que precisa sair, e isto é uma
 * lista para consultar. Ninguém aqui está atrasado e nada sai sozinho.
 */
export default function Recuperacao({ dados, modoManual, recarregar, aviso, editarTexto }) {
  if (!dados) return <div className="card rcp-vazio">Carregando…</div>;
  const { prazo, itens } = dados;

  const chamar = async (c) => {
    // Abre no próprio toque: depois de um await o navegador trata como pop-up.
    const janela = modoManual ? window.open('about:blank', '_blank') : null;
    try {
      const r = await api.chamarDeVolta(c.id);
      if (r.link) {
        if (janela) { janela.opener = null; janela.location.href = r.link; }
        else window.open(r.link, '_blank', 'noopener');
      } else {
        aviso(`Mensagem enviada para ${c.nome.split(' ')[0]}`);
      }
      recarregar();
    } catch (erro) {
      janela?.close();
      aviso(erro.message);
    }
  };

  return (
    <>
      <div className="card crm-aviso rcp-topo">
        <span>Clientes sem horário marcado que não voltam há mais tempo que o prazo. Mandar mensagem é opcional.</span>
        <button className="btn btn-g btn-s" onClick={editarTexto}><Pencil size={14} /> Editar texto</button>
        <PrazoDaLista key={prazo} prazo={prazo} aoSalvar={recarregar} aviso={aviso} />
      </div>

      {itens.length === 0
        ? <div className="card rcp-vazio">Ninguém sumido. Quem passar de {prazo} dias sem voltar aparece aqui.</div>
        : (
          <div className="card list">
            {itens.map(c => (
              <div key={c.id} className="li rcp-linha">
                <div className="avatar rcp-foto">{iniciais(c.nome)}</div>
                <div className="rcp-quem">
                  <div className="nm">{c.nome}</div>
                  <div className="mt">
                    <span>Há {c.dias} dias</span>
                    {c.ultimoServico && <span>{c.ultimoServico}</span>}
                    <span>{c.visitas} {c.visitas === 1 ? 'visita' : 'visitas'}</span>
                  </div>
                  {c.chamadaEm && <div className="rcp-chamada">Chamada em {fmtData(c.chamadaEm.slice(0, 10))}</div>}
                </div>
                {c.optin && c.fone
                  ? <button className="btn btn-wa btn-s" onClick={() => chamar(c)}><Send size={14} /> Chamar</button>
                  : <span className="tag rcp-sem">{c.fone ? 'Sem opt-in' : 'Sem telefone'}</span>}
              </div>
            ))}
          </div>
        )}
    </>
  );
}
