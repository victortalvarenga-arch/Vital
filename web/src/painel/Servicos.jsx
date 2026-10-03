import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, MoreVertical, Plus, Search, Trash2, Upload } from 'lucide-react';
import { api } from '../shared/painel-api.js';
import { brl } from '../shared/formato.js';
import { addDias, hojeISO, iniciais } from '../shared/tempo.js';
import { prepararImagem } from '../shared/imagem.js';
import { Campo, Gaveta, Switch } from './Base.jsx';
import { corDaCategoria } from './paleta.js';

/**
 * Serviços: o catálogo, com o que cada um custa, dura e paga de comissão.
 *
 * A lista é uma tabela no computador e vira cartão no celular — a mesma
 * marcação, o CSS decide. O dono abre isto do balcão para conferir preço tanto
 * quanto do telefone para ajustar um.
 *
 * O formulário mostra primeiro o que se mexe toda semana (nome, preço, duração,
 * quem faz, comissão) e guarda o resto — o que aparece no site e os
 * adicionais — em seções que abrem quando se precisa. Antes era uma coluna só
 * de quinze campos, e o preço ficava no meio da foto e dos extras.
 */

const DURACOES = [15, 20, 30, 40, 45, 50, 60, 75, 90, 105, 120, 150, 180, 240];

const STATUS = [
  ['', 'Todos os status'],
  ['ativo', 'Ativos no site'],
  ['oculto', 'Ocultos'],
  ['adicional', 'Só como adicional'],
];

const NOVO = {
  nome: '', cat: '', desc: '', preco: 0, duracao: 60, intervalo: 10, ativo: true, profs: [],
  foto: '', mostrarPreco: true, somenteAdicional: false, comissao: null, comissoes: {}, obs: '',
};

export default function Servicos({ dados, acao, aviso }) {
  const { servicos, staff, agendamentos = [] } = dados;
  const [edit, setEdit] = useState(null);
  const [aberto, setAberto] = useState(null);
  const [busca, setBusca] = useState('');
  const [filtroCat, setFiltroCat] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');

  const categorias = [...new Set(servicos.map(x => x.cat).filter(Boolean))].sort();

  /* ── os números do topo ── */
  // Trinta dias, e não o mês corrente: no dia 2 o "mês" tem dois dias, e o
  // serviço mais agendado seria o de quem marcou ontem.
  const desde = addDias(hojeISO(), -30);
  const recentes = agendamentos.filter(a => a.data >= desde && a.data <= hojeISO() && a.status !== 'cancelado');
  const porServico = new Map();
  for (const a of recentes) porServico.set(a.servico, (porServico.get(a.servico) || 0) + 1);
  const [topoId, topoQtd] = [...porServico].sort((a, b) => b[1] - a[1])[0] || [];
  const topo = servicos.find(s => s.id === topoId);
  const concluidos = recentes.filter(a => a.status === 'concluido');
  const ticket = concluidos.length ? concluidos.reduce((s, a) => s + a.valor, 0) / concluidos.length : null;

  /* ── filtro ── */
  const q = chave(busca.trim());
  const visiveis = servicos.filter(s => {
    if (filtroCat && s.cat !== filtroCat) return false;
    if (filtroStatus === 'ativo' && !(s.ativo && !s.somenteAdicional)) return false;
    if (filtroStatus === 'oculto' && s.ativo) return false;
    if (filtroStatus === 'adicional' && !s.somenteAdicional) return false;
    return !q || chave(`${s.nome} ${s.cat}`).includes(q);
  });

  const alternarAtivo = s => {
    setAberto(null);
    acao(() => api.salvarServico({ ...s, ativo: !s.ativo }), s.ativo ? 'Serviço oculto do site' : 'Serviço visível no site');
  };
  const remover = async s => {
    setAberto(null);
    if (!confirm(`Remover "${s.nome}"? Se já tiver agendamentos, ele só sai do catálogo e o histórico fica.`)) return;
    await acao(() => api.removerServico(s.id), 'Serviço removido');
  };

  return (
    <>
      <div className="head">
        <div>
          <h2>Serviços</h2>
          <div className="sub">Gerencie os serviços oferecidos, preços, duração e profissionais.</div>
        </div>
        <button className="btn btn-p btn-s" onClick={() => setEdit(NOVO)}><Plus size={16} /> Novo serviço</button>
      </div>

      <div className="stats sv-stats">
        <Numero rotulo="Serviços ativos" valor={servicos.filter(s => s.ativo).length}
                sub={`de ${servicos.length} cadastrados`} />
        <Numero rotulo="Categorias" valor={categorias.length}
                sub={categorias.length === 1 ? 'categoria' : 'categorias'} />
        <Numero rotulo="Mais agendado" valor={topo ? topo.nome : '—'} texto
                sub={topo ? `${topoQtd} ${topoQtd === 1 ? 'agendamento' : 'agendamentos'} em 30 dias` : 'nada nos últimos 30 dias'} />
        <Numero rotulo="Ticket médio" valor={ticket == null ? '—' : brl(ticket)}
                sub="por atendimento, 30 dias" />
      </div>

      <div className="card sv-filtros">
        <div className="sv-busca">
          <Search size={16} aria-hidden="true" />
          <input placeholder="Buscar serviço…" value={busca} onChange={e => setBusca(e.target.value)}
                 aria-label="Buscar serviço" />
        </div>
        <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} aria-label="Status">
          {STATUS.map(([k, r]) => <option key={k} value={k}>{r}</option>)}
        </select>
      </div>

      <div className="card sv-tabela" role="table" aria-label="Serviços">
        <div className="sv-linha sv-cab" role="row">
          <span role="columnheader">Serviço</span>
          <span role="columnheader">Categoria</span>
          <span role="columnheader">Duração</span>
          <span role="columnheader">Preço</span>
          <span role="columnheader">Comissão</span>
          <span role="columnheader">Status</span>
          <span role="columnheader" aria-label="Ações" />
        </div>
        {visiveis.map(s => {
          const excecoes = Object.keys(s.comissoes || {}).length;
          return (
            <div key={s.id} className="sv-linha" role="row">
              <button className="sv-nome" role="cell" onClick={() => setEdit(s)}>
                <span className="sv-cor" style={{ background: corDaCategoria(s.cat) }} aria-hidden="true" />
                <span>
                  <b>{s.nome}</b>
                  <small>{nomesDe(s.profs, staff) || 'Sem profissional'}</small>
                </span>
              </button>
              <span role="cell" className="sv-cat">{s.cat || '—'}</span>
              <span role="cell" className="mono sv-dur">{s.duracao} min</span>
              <span role="cell" className="mono sv-preco">{brl(s.preco)}</span>
              <span role="cell" className="sv-com">
                {s.comissao != null ? `${pct(s.comissao)}%` : <i>Da profissional</i>}
                {excecoes > 0 && <small>{excecoes} {excecoes === 1 ? 'exceção' : 'exceções'}</small>}
              </span>
              <span role="cell" className={'sv-status ' + estadoDe(s).tom}>{estadoDe(s).rotulo}</span>
              <span role="cell" className="sv-acoes">
                <button className="sv-mais" onClick={() => setAberto(a => a === s.id ? null : s.id)}
                        aria-expanded={aberto === s.id} aria-label={`Ações de ${s.nome}`}>
                  <MoreVertical size={18} />
                </button>
                {aberto === s.id && (
                  <span className="sv-menu" role="menu">
                    <button role="menuitem" onClick={() => { setAberto(null); setEdit(s); }}>Editar</button>
                    <button role="menuitem" onClick={() => alternarAtivo(s)}>
                      {s.ativo ? 'Ocultar do site' : 'Mostrar no site'}
                    </button>
                    <button role="menuitem" className="btn-erro" onClick={() => remover(s)}>Remover</button>
                  </span>
                )}
              </span>
            </div>
          );
        })}
        {visiveis.length === 0 && (
          <p className="sv-vazio">
            {servicos.length === 0 ? 'Nenhum serviço ainda. Comece pelo "Novo serviço".' : 'Nenhum serviço com esse filtro.'}
          </p>
        )}
      </div>

      {edit && <EditarServico s={edit} staff={staff} servicos={servicos} acao={acao}
                              fechar={() => setEdit(null)} aviso={aviso} categorias={categorias} />}
    </>
  );
}

function Numero({ rotulo, valor, sub, texto }) {
  return (
    <div className="card stat">
      <span className="eyebrow">{rotulo}</span>
      <span className={'v' + (texto ? ' sv-v-texto' : '')} title={texto ? String(valor) : undefined}>{valor}</span>
      <span className="sv-stat-sub">{sub}</span>
    </div>
  );
}

function EditarServico({ s, staff, servicos = [], acao, fechar, aviso, categorias = [] }) {
  const [f, setF] = useState({ ...s, comissoes: { ...(s.comissoes || {}) } });
  // Duas direções, porque a empresa pensa das duas formas:
  //   ofertados  → "este serviço oferece estes extras"   (editando o principal)
  //   ondeSouExtra → "este serviço é extra nestes grupos" (editando o extra)
  const [ofertados, setOfertados] = useState(null);
  const [ondeSouExtra, setOndeSouExtra] = useState(null);
  // Qual categoria está sendo folheada na lista de extras. Não é o que está
  // marcado — é só o recorte visível, para não despejar o catálogo inteiro.
  const [folheando, setFolheando] = useState(s.cat || '');
  const entradaFoto = useRef(null);
  const [subindo, setSubindo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const mudar = (campo, valor) => setF(v => ({ ...v, [campo]: valor }));
  const toggleProf = id => setF(v => ({ ...v, profs: v.profs.includes(id) ? v.profs.filter(x => x !== id) : [...v.profs, id] }));
  const mudarExcecao = (id, valor) => setF(v => {
    const comissoes = { ...v.comissoes };
    if (valor === '') delete comissoes[id]; else comissoes[id] = valor;
    return { ...v, comissoes };
  });

  // Carrega as duas regras de adicional ao abrir; sem isso não dá para saber o
  // que já está marcado e o formulário apagaria tudo ao salvar.
  useEffect(() => {
    let vivo = true;
    api.adicionais()
      .then(r => {
        if (!vivo) return;
        setOfertados(s.id ? (r.porServico[s.id] || []) : []);
        // A volta: varre as categorias procurando onde este serviço aparece.
        setOndeSouExtra(
          Object.entries(r.porCategoria)
            .filter(([, ids]) => ids.includes(s.id))
            .map(([cat]) => cat)
        );
      })
      .catch(() => { if (vivo) { setOfertados([]); setOndeSouExtra([]); } });
    return () => { vivo = false; };
  }, [s.id]);

  // Enquanto não carregou, não dá para desenhar chip desmarcado: pareceria que
  // a empresa não tem nada cadastrado.
  const carregando = ofertados === null || ondeSouExtra === null;
  const alternar = (lista, set, valor) =>
    set(lista.includes(valor) ? lista.filter(x => x !== valor) : [...lista, valor]);

  const candidatos = servicos.filter(x => x.id !== s.id);
  // Serviço novo ainda não tem categoria, e a dele pode ter sido renomeada:
  // sem esta volta, o filtro ficaria apontando para o nada e a lista vazia.
  const catAtiva = categorias.includes(folheando) ? folheando : (categorias[0] || '');
  const visiveisParaExtra = categorias.length > 1
    ? candidatos.filter(x => x.cat === catAtiva)
    : candidatos;
  const marcadosForaDaVista = (ofertados || [])
    .map(id => candidatos.find(x => x.id === id))
    .filter(x => x && !visiveisParaExtra.includes(x));

  const pctInvalido = v => v !== '' && v != null && (Number(v) < 0 || Number(v) > 100);
  const problema =
    !f.nome.trim() ? 'Dê um nome ao serviço.'
    : f.profs.length === 0 ? 'Marque ao menos uma profissional que faz este serviço.'
    : pctInvalido(f.comissao) || Object.values(f.comissoes).some(pctInvalido) ? 'Comissão vai de 0 a 100%.'
    : null;

  const salvar = async e => {
    e.preventDefault();
    if (problema) return aviso?.(problema);
    setSalvando(true);
    // Só vai exceção de quem faz o serviço: desmarcar alguém leva a exceção
    // dela junto, e remarcar depois começa do zero.
    const comissoes = Object.fromEntries(Object.entries(f.comissoes).filter(([id]) => f.profs.includes(id)));
    const ok = await acao(async () => {
      // Serviço novo só ganha id ao ser criado, e os extras precisam dele.
      const salvo = await api.salvarServico({ ...f, comissao: f.comissao === '' ? null : f.comissao, comissoes });
      const id = s.id || salvo?.id;
      if (ofertados && id) await api.salvarAdicionaisDoServico(id, ofertados);
      if (ondeSouExtra && id) await api.salvarCategoriasDoAdicional(id, ondeSouExtra);
    }, 'Serviço salvo');
    setSalvando(false);
    if (ok) fechar();
  };

  const enviarFoto = async ev => {
    const arquivo = ev.target.files?.[0];
    ev.target.value = '';
    if (!arquivo) return;
    setSubindo(true);
    try {
      const dataUrl = await prepararImagem(arquivo, { largura: 900 });
      const { url } = await api.enviarImagem(dataUrl, 'servico');
      mudar('foto', url);
    } catch (erro) {
      aviso?.(erro.message);
    } finally {
      setSubindo(false);
    }
  };

  const duracoes = DURACOES.includes(Number(f.duracao)) ? DURACOES : [...DURACOES, Number(f.duracao)].sort((a, b) => a - b);
  const ativos = staff.filter(p => p.ativo || f.profs.includes(p.id));

  return (
    <Gaveta onClose={fechar} titulo={s.id ? 'Editar serviço' : 'Novo serviço'} largura={500}>
      <form onSubmit={salvar} className="sv-form">
        <h2>{s.id ? 'Editar serviço' : 'Novo serviço'}</h2>

        <Campo label="Nome">
          <input value={f.nome} onChange={e => mudar('nome', e.target.value)} />
        </Campo>

        <Campo label="Categoria">
          {/* Texto livre com sugestões, não lista fixa: cada ramo tem os
              próprios grupos, e uma lista no código só serviria a um deles. */}
          <input list="categorias-existentes" value={f.cat}
                 /* O exemplo sai do que a própria empresa já cadastrou: um
                    exemplo escrito no código é sempre o ramo de outra pessoa. */
                 placeholder={categorias[0] ? `Ex.: ${categorias[0]}` : 'Como você agrupa seus serviços'}
                 onChange={e => mudar('cat', e.target.value)} />
          <datalist id="categorias-existentes">
            {categorias.map(c => <option key={c} value={c} />)}
          </datalist>
        </Campo>

        <div className="mrow">
          <Campo label="Preço">
            <span className="campo-pre">
              <i>R$</i>
              <input type="number" min={0} step="0.01" inputMode="decimal" value={f.preco}
                     onChange={e => mudar('preco', +e.target.value)} />
            </span>
          </Campo>
          <Campo label="Duração">
            <select value={f.duracao} onChange={e => mudar('duracao', +e.target.value)}>
              {duracoes.map(d => <option key={d} value={d}>{duracaoPorExtenso(d)}</option>)}
            </select>
          </Campo>
        </div>

        <Campo label="Profissionais habilitados">
          {/* A comissão ao lado de cada nome é a exceção dela neste serviço.
              Em branco, vale a de baixo — e, sem ela, a padrão da pessoa. */}
          <div className="sv-profs">
            {ativos.map(p => {
              const on = f.profs.includes(p.id);
              return (
                <div key={p.id} className={'sv-prof' + (on ? ' on' : '')}>
                  <label className="sv-prof-marca">
                    <input type="checkbox" checked={on} onChange={() => toggleProf(p.id)} />
                    <span className="avatar sv-av" style={{ background: p.cor }}>{iniciais(p.nome)}</span>
                    <span className="sv-prof-nome">{p.nome}</span>
                  </label>
                  {on && (
                    <span className="campo-pct sv-prof-pct">
                      <input type="number" min={0} max={100} step="0.5" inputMode="decimal"
                             value={f.comissoes[p.id] ?? ''} aria-label={`Comissão de ${p.nome} neste serviço`}
                             placeholder={f.comissao !== '' && f.comissao != null ? String(f.comissao)
                               : p.comissaoTipo === 'fixo' ? 'fixo' : String(p.comissao ?? 0)}
                             onChange={e => mudarExcecao(p.id, e.target.value)} />
                      <i>%</i>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Campo>

        <Campo label="Comissão do serviço">
          <span className="campo-pct sv-com-campo">
            <input type="number" min={0} max={100} step="0.5" inputMode="decimal"
                   value={f.comissao ?? ''} placeholder="Da profissional"
                   onChange={e => mudar('comissao', e.target.value)} />
            <i>%</i>
          </span>
          <p className="add-ajuda">
            Vale para quem fizer este serviço. Em branco, cada uma recebe a
            comissão padrão dela. O campo ao lado do nome, acima, é a exceção.
          </p>
        </Campo>

        <label className="sv-check">
          <input type="checkbox" checked={!!f.ativo} onChange={e => mudar('ativo', e.target.checked)} />
          <span><b>Serviço ativo</b><small>Aparece no site e pode ser agendado</small></span>
        </label>

        <Campo label="Observações">
          <textarea rows={2} value={f.obs} maxLength={1000} onChange={e => mudar('obs', e.target.value)}
                    placeholder="Informações internas sobre o serviço…" />
          <p className="add-ajuda">Só a equipe vê. Não aparece no site.</p>
        </Campo>

        <details className="sv-mais-campos">
          <summary>No site: descrição, foto e preço</summary>
          <Campo label="Descrição (aparece no site)">
            <textarea rows={2} value={f.desc} onChange={e => mudar('desc', e.target.value)} />
          </Campo>
          <Campo label="Foto (aparece no site)">
            <div className="svc-foto-campo">
              <div className="svc-foto-previa">
                {f.foto ? <img src={f.foto} alt="" /> : <ImageIcon size={18} />}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-g btn-s" disabled={subindo} onClick={() => entradaFoto.current?.click()}>
                  <Upload size={14} /> {subindo ? 'Enviando…' : f.foto ? 'Trocar' : 'Enviar'}
                </button>
                {f.foto && (
                  <button type="button" className="btn btn-g btn-s" onClick={() => mudar('foto', '')} aria-label="Tirar a foto">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <input ref={entradaFoto} type="file" accept="image/*" hidden onChange={enviarFoto} />
            </div>
          </Campo>
          <div className="sv-switch">
            <Switch on={f.mostrarPreco !== false} onChange={() => mudar('mostrarPreco', f.mostrarPreco === false)} />
            <span>Mostrar o preço <small>— desligado, aparece “Sob consulta”</small></span>
          </div>
        </details>

        <details className="sv-mais-campos">
          <summary>Adicionais</summary>
          {carregando ? (
            <p className="add-ajuda">Carregando…</p>
          ) : (
            <>
              <Campo label={`Adicionais oferecidos com "${f.nome || 'este serviço'}"`}>
                <p className="add-ajuda">
                  Quem escolher este serviço no site vai poder incluir os que você
                  marcar aqui. Cada um soma o próprio preço e a própria duração.
                </p>

                {/* Categoria primeiro: com catálogo grande, despejar tudo de uma
                    vez vira uma parede de pílulas onde não se acha nada. */}
                {categorias.length > 1 && (
                  <div className="chips filtro-cat">
                    {categorias.map(c => {
                      const marcadosAqui = servicos.filter(x => x.cat === c && ofertados.includes(x.id)).length;
                      return (
                        <button key={c} type="button"
                                className={'chip chip-cat' + (catAtiva === c ? ' on' : '')}
                                onClick={() => setFolheando(c)}>
                          {c}
                          {marcadosAqui > 0 && <span className="chip-n">{marcadosAqui}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="chips chips-rolagem">
                  {visiveisParaExtra.length === 0
                    ? <p className="add-ajuda">Nenhum outro serviço nesta categoria.</p>
                    : visiveisParaExtra.map(x => (
                        <button key={x.id} type="button"
                                className={'chip' + (ofertados.includes(x.id) ? ' on' : '')}
                                onClick={() => alternar(ofertados, setOfertados, x.id)}>
                          {x.nome}
                        </button>
                      ))}
                </div>

                {/* O que está marcado fora do recorte visível precisa aparecer,
                    senão some da vista e a pessoa acha que perdeu. */}
                {marcadosForaDaVista.length > 0 && (
                  <p className="add-ajuda">
                    Também marcados em outras categorias:{' '}
                    {marcadosForaDaVista.map(x => x.nome).join(', ')}
                  </p>
                )}
                {ofertados.length === 0 && (
                  <p className="add-ajuda">Nenhum marcado: o passo de adicionais não aparece para este serviço.</p>
                )}
              </Campo>

              <Campo label={`Oferecer "${f.nome || 'este serviço'}" como adicional em`}>
                <p className="add-ajuda">
                  O caminho inverso: marque as categorias em que ele deve ser
                  oferecido como extra. Serve para o que quase nunca é vendido
                  sozinho, e sim junto de outra coisa.
                </p>
                {categorias.length === 0
                  ? <p className="add-ajuda">Cadastre uma categoria em algum serviço primeiro.</p>
                  : (
                    <div className="chips">
                      {categorias.map(c => (
                        <button key={c} type="button"
                                className={'chip' + (ondeSouExtra.includes(c) ? ' on' : '')}
                                onClick={() => alternar(ondeSouExtra, setOndeSouExtra, c)}>
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
              </Campo>
            </>
          )}
          {/* Diferente de arquivar: continua ativo e continua valendo como extra.
              O que ele deixa de ser é serviço principal. */}
          <div className="sv-switch">
            <Switch on={!!f.somenteAdicional} onChange={() => mudar('somenteAdicional', !f.somenteAdicional)} />
            <span>Vender só como adicional <small>— some da vitrine, continua sendo oferecido junto de outro</small></span>
          </div>
        </details>

        {problema && <p className="sv-problema" aria-live="polite">{problema}</p>}

        <div className="sv-botoes">
          <button type="button" className="btn btn-g" onClick={fechar}>Cancelar</button>
          <button type="submit" className="btn btn-p" disabled={salvando || Boolean(problema)}>
            {salvando ? 'Salvando…' : s.id ? 'Salvar alterações' : 'Criar serviço'}
          </button>
        </div>
      </form>
    </Gaveta>
  );
}

/** "Ativo", "Oculto" ou "Só adicional" — e o tom do selo. */
function estadoDe(s) {
  if (!s.ativo) return { rotulo: 'Oculto', tom: 'off' };
  if (s.somenteAdicional) return { rotulo: 'Só adicional', tom: 'extra' };
  return { rotulo: 'Ativo', tom: 'on' };
}

const nomesDe = (ids, staff) =>
  ids.map(id => staff.find(p => p.id === id)?.nome.split(' ')[0]).filter(Boolean).join(', ');

/** 10 → "10", 12.5 → "12,5". */
const pct = v => String(Number(v)).replace('.', ',');

/** 60 → "60 minutos", 90 → "1h30". */
function duracaoPorExtenso(m) {
  if (m < 60) return `${m} minutos`;
  const h = Math.floor(m / 60), r = m % 60;
  if (m === 60) return '60 minutos';
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h} horas`;
}

/** Busca sem acento e sem caixa. */
const chave = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
