import { useState } from 'react';
import { ClipboardList, GripVertical, Plus, Trash2, X } from 'lucide-react';
import { api } from '../shared/painel-api.js';

/**
 * Formulários de intake: o que a empresa pergunta antes de atender.
 *
 * Anamnese de estética, ficha de saúde da clínica, preferências do pet. Cada
 * ramo pergunta uma coisa, então a pergunta é cadastro — não campo fixo que a
 * gente escolheu por eles.
 *
 * A tela é um construtor, e o difícil dela é não parecer um. Quem monta isso não
 * é programador: as perguntas aparecem numa lista, na ordem em que a cliente vai
 * ver, e o tipo é escolhido por rótulo ("Sim ou não", "Escolher uma") em vez de
 * nome técnico.
 */

const TIPOS = [
  ['texto', 'Texto curto'],
  ['longo', 'Texto longo'],
  ['numero', 'Número'],
  ['data', 'Data'],
  ['sim_nao', 'Sim ou não'],
  ['escolha', 'Escolher uma'],
  ['multipla', 'Escolher várias'],
];
const NOME_DO_TIPO = Object.fromEntries(TIPOS);

export default function Formularios({ dados, acao, aviso }) {
  const [lista, setLista] = useState(null);
  const [edit, setEdit] = useState(null);

  const carregar = async () => {
    try { setLista(await api.formularios()); }
    catch (e) { aviso(e.message); setLista([]); }
  };
  if (lista === null) { carregar(); }

  const arquivar = async f => {
    if (!confirm(`Tirar "${f.nome}" do ar?\n\nAs fichas já respondidas continuam no histórico.`)) return;
    await acao(() => api.removerFormulario(f.id), 'Formulário arquivado');
    await carregar();
    setEdit(null);
  };

  const servicosDe = f => dados.servicos
    .filter(s => f.servicosIds?.includes(s.id))
    .map(s => s.nome);

  return (
    <>
      <div className="head">
        <div>
          <h2>Formulários</h2>
          <div className="sub">O que a cliente responde antes de ser atendida</div>
        </div>
        <button className="btn btn-p btn-s" onClick={() => setEdit(vazio())}>
          <Plus size={16} /> Novo formulário
        </button>
      </div>

      {lista?.length === 0 && (
        <div className="card" style={{ padding: 34, textAlign: 'center' }}>
          <ClipboardList size={26} style={{ color: 'var(--muted)' }} />
          <p className="p-fraco" style={{ margin: '10px 0 4px' }}>Nenhum formulário ainda.</p>
          <p className="add-ajuda" style={{ margin: 0 }}>
            Serve para o que você precisa saber antes de começar — alergia,
            gravidez, medicação, preferência. A cliente responde ao agendar, e a
            resposta fica no atendimento.
          </p>
        </div>
      )}

      <div className="list">
        {lista?.map(f => (
          <div key={f.id} className={'li form-li' + (f.ativo ? '' : ' off')}>
            <span className="form-marca"><ClipboardList size={16} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="nm">
                {f.nome}
                {!f.ativo && <span className="form-tag">arquivado</span>}
              </div>
              <div className="mt">
                <span>{f.campos.length} {f.campos.length === 1 ? 'pergunta' : 'perguntas'}</span>
                <span>
                  {servicosDe(f).length
                    ? `em ${servicosDe(f).join(', ')}`
                    : 'não está ligado a nenhum serviço'}
                </span>
              </div>
            </div>
            <button className="btn btn-g btn-s" onClick={() => setEdit({ ...f })}>Editar</button>
          </div>
        ))}
      </div>

      {edit && (
        <Editar
          f0={edit} servicos={dados.servicos.filter(s => s.ativo)} aviso={aviso}
          fechar={() => setEdit(null)}
          aoSalvar={async f => {
            const ok = await acao(() => api.salvarFormulario(f), f.id ? 'Formulário salvo' : 'Formulário criado');
            if (ok) { await carregar(); setEdit(null); }
            return ok;
          }}
          aoArquivar={edit.id && edit.ativo ? () => arquivar(edit) : null}
        />
      )}
    </>
  );
}

const vazio = () => ({ nome: '', descricao: '', ativo: true, campos: [], servicosIds: [] });
const perguntaVazia = () => ({ rotulo: '', ajuda: '', tipo: 'texto', obrigatorio: false, opcoes: [] });

function Editar({ f0, servicos, fechar, aoSalvar, aoArquivar, aviso }) {
  const [f, setF] = useState(f0);
  const [ocupado, setOcupado] = useState(false);
  const muda = patch => setF(v => ({ ...v, ...patch }));

  const mudaCampo = (i, patch) => setF(v => ({
    ...v, campos: v.campos.map((c, j) => (i === j ? { ...c, ...patch } : c)),
  }));
  const remover = i => setF(v => ({ ...v, campos: v.campos.filter((_, j) => j !== i) }));
  // A ordem na tela é a ordem em que a cliente responde: mover é reordenar.
  const mover = (i, d) => setF(v => {
    const campos = [...v.campos];
    const j = i + d;
    if (j < 0 || j >= campos.length) return v;
    [campos[i], campos[j]] = [campos[j], campos[i]];
    return { ...v, campos };
  });

  const alternarServico = id => muda({
    servicosIds: f.servicosIds.includes(id)
      ? f.servicosIds.filter(x => x !== id)
      : [...f.servicosIds, id],
  });

  const enviar = async e => {
    e.preventDefault();
    if (!f.campos.length) return aviso('Adicione ao menos uma pergunta.');
    if (f.campos.some(c => !c.rotulo.trim())) return aviso('Toda pergunta precisa de um enunciado.');
    const semOpcao = f.campos.find(c => ['escolha', 'multipla'].includes(c.tipo) && !c.opcoes.length);
    if (semOpcao) return aviso(`"${semOpcao.rotulo}" precisa de ao menos uma opção.`);
    setOcupado(true);
    if (!(await aoSalvar(f))) setOcupado(false);
  };

  return (
    <div className="ovl" onClick={fechar}>
      <form className="modal wide" onClick={e => e.stopPropagation()} onSubmit={enviar}>
        <h2 style={{ fontSize: 24, marginBottom: 18 }}>{f.id ? f.nome : 'Novo formulário'}</h2>

        <div className="mfield">
          <label htmlFor="fm-nome">Nome</label>
          <input id="fm-nome" required autoFocus value={f.nome} placeholder="Anamnese"
                 onChange={e => muda({ nome: e.target.value })} />
        </div>

        <div className="mfield">
          <label htmlFor="fm-desc">Recado antes das perguntas</label>
          <input id="fm-desc" value={f.descricao} maxLength={200}
                 placeholder="Antes de começar, precisamos saber algumas coisas."
                 onChange={e => muda({ descricao: e.target.value })} />
        </div>

        <div className="mfield">
          <label>Em quais serviços perguntar</label>
          <div className="chips chips-rolagem">
            {servicos.map(s => (
              <button key={s.id} type="button"
                      className={'chip chip-cat' + (f.servicosIds.includes(s.id) ? ' on' : '')}
                      onClick={() => alternarServico(s.id)}>{s.nome}</button>
            ))}
          </div>
          <span className="add-ajuda" style={{ marginTop: 6, display: 'block' }}>
            A mesma ficha serve vários serviços. Sem nenhum marcado, ela não é
            perguntada a ninguém.
          </span>
        </div>

        <label style={{ display: 'block', marginBottom: 8 }}>Perguntas</label>
        {f.campos.map((c, i) => (
          <div key={i} className="perg">
            <div className="perg-topo">
              <span className="perg-n"><GripVertical size={13} /> {i + 1}</span>
              <input className="perg-rotulo" value={c.rotulo} placeholder="O que perguntar"
                     onChange={e => mudaCampo(i, { rotulo: e.target.value })} />
              <select value={c.tipo}
                      onChange={e => mudaCampo(i, { tipo: e.target.value, opcoes: [] })}>
                {TIPOS.map(([k, rotulo]) => <option key={k} value={k}>{rotulo}</option>)}
              </select>
              <button type="button" className="perg-btn" onClick={() => mover(i, -1)}
                      disabled={i === 0} aria-label="Subir">↑</button>
              <button type="button" className="perg-btn" onClick={() => mover(i, 1)}
                      disabled={i === f.campos.length - 1} aria-label="Descer">↓</button>
              <button type="button" className="perg-btn" onClick={() => remover(i)}
                      aria-label="Remover"><X size={14} /></button>
            </div>

            {['escolha', 'multipla'].includes(c.tipo) && (
              <Opcoes valores={c.opcoes} aoMudar={opcoes => mudaCampo(i, { opcoes })} />
            )}

            <div className="perg-pe">
              <label className="perg-obrig">
                <input type="checkbox" checked={c.obrigatorio}
                       onChange={e => mudaCampo(i, { obrigatorio: e.target.checked })} />
                Obrigatória
              </label>
              <input className="perg-ajuda" value={c.ajuda} maxLength={120}
                     placeholder="Explicação, se precisar"
                     onChange={e => mudaCampo(i, { ajuda: e.target.value })} />
            </div>
          </div>
        ))}

        <button type="button" className="btn btn-g btn-s" style={{ marginBottom: 18 }}
                onClick={() => setF(v => ({ ...v, campos: [...v.campos, perguntaVazia()] }))}>
          <Plus size={15} /> Adicionar pergunta
        </button>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-p" style={{ flex: 1 }} type="submit" disabled={ocupado}>
            {ocupado ? 'Salvando…' : f.id ? 'Salvar' : 'Criar formulário'}
          </button>
          <button className="btn btn-g" type="button" onClick={fechar}>Cancelar</button>
          {aoArquivar && (
            <button className="btn btn-g btn-erro" type="button"
                    title="Tirar do ar" onClick={aoArquivar}><Trash2 size={16} /></button>
          )}
        </div>
      </form>
    </div>
  );
}

/** As alternativas de uma pergunta de escolha. */
function Opcoes({ valores, aoMudar }) {
  const [nova, setNova] = useState('');
  const juntar = () => {
    const v = nova.trim();
    if (!v || valores.includes(v)) return setNova('');
    aoMudar([...valores, v]);
    setNova('');
  };
  return (
    <div className="perg-opcoes">
      {valores.map(v => (
        <span key={v} className="perg-op">
          {v}
          <button type="button" onClick={() => aoMudar(valores.filter(x => x !== v))}
                  aria-label={`Remover ${v}`}><X size={11} /></button>
        </span>
      ))}
      <input value={nova} placeholder="nova opção + Enter"
             onChange={e => setNova(e.target.value)}
             onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); juntar(); } }}
             onBlur={juntar} />
    </div>
  );
}

export { NOME_DO_TIPO };
