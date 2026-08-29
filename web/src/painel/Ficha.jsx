import { useEffect, useState } from 'react';
import { api } from '../shared/painel-api.js';

/**
 * As perguntas do formulário, para responder pelo balcão.
 *
 * Existe porque o servidor exige a ficha em **todo** agendamento, inclusive o
 * encaixe manual — e sem esta tela um serviço com anamnese obrigatória ficaria
 * impossível de marcar pelo painel. A regra não podia ser afrouxada para o
 * balcão: ficha que só o site preenche é ficha que metade dos atendimentos não
 * tem.
 *
 * Aqui a cliente já foi escolhida numa lista, então dá para trazer o que ela
 * respondeu da última vez. No site isso não é possível — lá ela só é
 * identificada no fim.
 */
export default function Ficha({ servicoId, clienteId, valor, aoMudar }) {
  const [forms, setForms] = useState([]);

  useEffect(() => {
    if (!servicoId) return setForms([]);
    let valeu = true;
    api.formulariosDoServico(servicoId)
      .then(fs => { if (valeu) setForms(fs); })
      .catch(() => { if (valeu) setForms([]); });
    return () => { valeu = false; };
  }, [servicoId]);

  // O que ela respondeu da última vez entra como sugestão, e só onde ainda não
  // se mexeu — quem já começou a preencher não pode ver o texto trocar sozinho.
  useEffect(() => {
    if (!clienteId || !forms.length) return;
    let valeu = true;
    (async () => {
      for (const f of forms) {
        if (valor[f.id]?.length) continue;
        const { respostas } = await api.ultimaFicha(f.id, clienteId).catch(() => ({}));
        if (!valeu || !respostas) continue;
        // A resposta antiga guarda o rótulo, não o id da pergunta — o rótulo é
        // congelado de propósito. O casamento é por texto, e pergunta renomeada
        // simplesmente não sugere nada.
        const porRotulo = new Map(respostas.map(r => [r.rotulo, r.valor]));
        const preenchido = f.campos
          .filter(c => porRotulo.has(c.rotulo))
          .map(c => ({ campoId: c.id, valor: porRotulo.get(c.rotulo) }));
        if (preenchido.length) aoMudar(f.id, preenchido);
      }
    })();
    return () => { valeu = false; };
  }, [clienteId, forms]);

  if (!forms.length) return null;

  const set = (formId, campoId, v) => {
    const atuais = (valor[formId] || []).filter(r => r.campoId !== campoId);
    aoMudar(formId, [...atuais, { campoId, valor: v }]);
  };
  const pega = (formId, campoId) =>
    (valor[formId] || []).find(r => r.campoId === campoId)?.valor;

  return forms.map(f => (
    <div key={f.id} className="ficha">
      <div className="ficha-t">{f.nome}</div>
      {f.descricao && <p className="add-ajuda" style={{ marginTop: 0 }}>{f.descricao}</p>}
      {f.campos.map(c => (
        <Pergunta key={c.id} campo={c} valor={pega(f.id, c.id)}
                  aoMudar={v => set(f.id, c.id, v)} />
      ))}
    </div>
  ));
}

function Pergunta({ campo, valor, aoMudar }) {
  const marcadas = Array.isArray(valor) ? valor : [];

  return (
    <div className="mfield">
      <label>
        {campo.rotulo}
        {campo.obrigatorio && <span className="ficha-obrig"> *</span>}
      </label>

      {campo.tipo === 'longo' && (
        <textarea rows={2} value={valor || ''} onChange={e => aoMudar(e.target.value)} />
      )}
      {['texto', 'numero', 'data'].includes(campo.tipo) && (
        <input type={campo.tipo === 'data' ? 'date' : campo.tipo === 'numero' ? 'number' : 'text'}
               value={valor ?? ''} onChange={e => aoMudar(e.target.value)} />
      )}
      {campo.tipo === 'sim_nao' && (
        <div className="chips">
          {[['sim', true], ['não', false]].map(([rotulo, v]) => (
            <button key={rotulo} type="button"
                    className={'chip' + (valor === v ? ' on' : '')}
                    onClick={() => aoMudar(v)}>{rotulo}</button>
          ))}
        </div>
      )}
      {campo.tipo === 'escolha' && (
        <div className="chips">
          {campo.opcoes.map(o => (
            <button key={o} type="button" className={'chip' + (valor === o ? ' on' : '')}
                    onClick={() => aoMudar(o)}>{o}</button>
          ))}
        </div>
      )}
      {campo.tipo === 'multipla' && (
        <div className="chips">
          {campo.opcoes.map(o => (
            <button key={o} type="button"
                    className={'chip' + (marcadas.includes(o) ? ' on' : '')}
                    onClick={() => aoMudar(marcadas.includes(o)
                      ? marcadas.filter(x => x !== o)
                      : [...marcadas, o])}>{o}</button>
          ))}
        </div>
      )}

      {campo.ajuda && <span className="add-ajuda" style={{ marginTop: 4 }}>{campo.ajuda}</span>}
    </div>
  );
}
