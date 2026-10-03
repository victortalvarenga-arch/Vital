import { useEffect, useState } from 'react';
import { MoreVertical, Pencil, Plus, Search } from 'lucide-react';
import { api } from '../shared/painel-api.js';
import { brl } from '../shared/formato.js';
import { hojeISO, iniciais } from '../shared/tempo.js';
import { Campo, Gaveta, Switch } from './Base.jsx';
import { PALETA } from './paleta.js';

/**
 * Profissionais: a equipe, o que cada um faz, quanto ganha e quando trabalha.
 *
 * A lista responde "quem está aqui e como foi o mês"; tocar numa pessoa abre a
 * ficha dela numa gaveta, em cinco partes — informações, serviços, comissão,
 * horários e desempenho. É tudo o que se ajusta numa pessoa, num lugar só: antes
 * a comissão por serviço morava na tela de Serviços e a jornada num modal à parte.
 *
 * **Os números de dinheiro vêm do servidor** (`/relatorios/resumo`, que já sabe
 * as três regras de comissão e o valor fixo — migrations 020 e 022). A tela não
 * refaz a conta: era o que fazia o cartão daqui discordar do Financeiro.
 */

// Segunda primeiro: é como a semana de trabalho se lê.
const DIAS_SEMANA = [
  [1, 'Segunda-feira'], [2, 'Terça-feira'], [3, 'Quarta-feira'], [4, 'Quinta-feira'],
  [5, 'Sexta-feira'], [6, 'Sábado'], [0, 'Domingo'],
];
// A régua das barras de horário: das 6h às 22h cobre quase todo comércio, e o
// que passar disso encosta na borda em vez de sumir.
const REGUA = [6 * 60, 22 * 60];

export default function Equipe({ dados, acao, aviso }) {
  const { staff, agendamentos = [], servicos } = dados;
  const [aberta, setAberta] = useState(null);
  const [menu, setMenu] = useState(null);
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('ativos');
  const [mes, setMes] = useState(null);
  const hoje = hojeISO();

  // Produção e comissão do mês, por pessoa. Recarrega quando o painel recarrega
  // (`staff` muda de identidade a cada `recarregar()`): mudar a comissão de
  // alguém aqui tem de mudar o número na mesma hora.
  useEffect(() => {
    let vivo = true;
    api.resumo({ mes: hoje.slice(0, 7) })
      .then(r => { if (vivo) setMes(Object.fromEntries(r.porProfissional.map(p => [p.id, p]))); })
      .catch(() => { if (vivo) setMes({}); });
    return () => { vivo = false; };
  }, [staff]);

  const ativos = staff.filter(p => p.ativo);
  const emAtendimento = new Set(agendamentos
    .filter(a => a.data === hoje && a.status === 'em_atendimento').map(a => a.prof));
  const comissoesDoMes = mes ? Object.values(mes).reduce((n, p) => n + (p.comissaoValor || 0), 0) : null;

  const q = chave(busca.trim());
  const visiveis = staff.filter(p => {
    if (status === 'ativos' && !p.ativo) return false;
    if (status === 'inativos' && p.ativo) return false;
    return !q || chave(p.nome).includes(q);
  });

  const servicosDe = p => servicos.filter(s => s.profs.includes(p.id));

  const alternarAtivo = p => {
    setMenu(null);
    acao(() => api.salvarProfissional({ ...p, ativo: !p.ativo }), p.ativo ? 'Profissional desativada' : 'Profissional reativada');
  };
  const remover = async p => {
    setMenu(null);
    if (!confirm(`Remover ${p.nome}? Se já tiver atendimentos, ela só é arquivada e o histórico fica.`)) return;
    await acao(() => api.removerProfissional(p.id), 'Profissional removida');
  };

  return (
    <>
      <div className="head">
        <div>
          <h2>Profissionais</h2>
          <div className="sub">Gerencie sua equipe, serviços, horários e comissões.</div>
        </div>
        <button className="btn btn-p btn-s"
                onClick={() => setAberta(novaPessoa(staff.length))}>
          <Plus size={16} /> Novo profissional
        </button>
      </div>

      <div className="stats pf-stats">
        <Numero rotulo="Profissionais ativos" valor={ativos.length} sub={`de ${staff.length} cadastrados`} />
        <Numero rotulo="Em atendimento" valor={emAtendimento.size}
                sub={emAtendimento.size === 1 ? 'pessoa com cliente agora' : 'pessoas com cliente agora'} />
        <Numero rotulo="Comissões do período" valor={comissoesDoMes == null ? '—' : brl(comissoesDoMes)}
                sub="este mês, atendimentos concluídos" />
      </div>

      <div className="card pf-filtros">
        <div className="pf-busca">
          <Search size={16} aria-hidden="true" />
          <input placeholder="Buscar profissional…" value={busca} onChange={e => setBusca(e.target.value)}
                 aria-label="Buscar profissional" />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Status">
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
          <option value="todos">Todos</option>
        </select>
      </div>

      <section className="card pf-secao">
        <div className="eyebrow pf-secao-t">Equipe</div>
        {visiveis.length === 0 && <p className="rs-vazio">Ninguém com esse filtro.</p>}
        <div className="pf-lista">
          {visiveis.map(p => {
            const m = mes?.[p.id];
            const nomes = servicosDe(p).map(s => s.nome);
            return (
              <div key={p.id} className={'pf-linha' + (p.ativo ? '' : ' fora')}>
                <button className="pf-pessoa" onClick={() => setAberta(p)}>
                  <span className="avatar pf-av" style={{ background: p.cor }}>{iniciais(p.nome)}</span>
                  <span className="pf-pessoa-txt">
                    <b>{p.nome}</b>
                    <small>{servicosDe(p).length} {servicosDe(p).length === 1 ? 'serviço' : 'serviços'}</small>
                  </span>
                </button>
                <span className={'pf-status ' + (emAtendimento.has(p.id) ? 'agora' : p.ativo ? 'on' : 'off')}>
                  {emAtendimento.has(p.id) ? 'Atendendo' : p.ativo ? 'Ativa' : 'Inativa'}
                </span>
                <span className="pf-num pf-qtd"><b>{m ? m.qtd : 0}</b> {m?.qtd === 1 ? 'atendimento' : 'atendimentos'}</span>
                <span className="pf-num pf-com"><b className="mono">{brl(m?.comissaoValor || 0)}</b> comissão</span>
                <span className="pf-acoes">
                  <button className="pf-mais" onClick={() => setMenu(x => x === p.id ? null : p.id)}
                          aria-expanded={menu === p.id} aria-label={`Ações de ${p.nome}`}>
                    <MoreVertical size={18} />
                  </button>
                  {menu === p.id && (
                    <span className="pf-menu" role="menu">
                      <button role="menuitem" onClick={() => { setMenu(null); setAberta(p); }}>Abrir ficha</button>
                      <button role="menuitem" onClick={() => alternarAtivo(p)}>{p.ativo ? 'Desativar' : 'Reativar'}</button>
                      <button role="menuitem" className="btn-erro" onClick={() => remover(p)}>Remover</button>
                    </span>
                  )}
                </span>
                <p className="pf-servicos">
                  <span>Serviços:</span> {nomes.length ? nomes.join(', ') : 'nenhum ainda'}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {aberta && (
        <Ficha p={aberta} servicos={servicos.filter(s => s.ativo || s.profs.includes(aberta.id))}
               unidades={dados.unidades || []} doMes={mes?.[aberta.id]}
               acao={acao} aviso={aviso} fechar={() => setAberta(null)} />
      )}
    </>
  );
}

function Numero({ rotulo, valor, sub }) {
  return (
    <div className="card stat">
      <span className="eyebrow">{rotulo}</span>
      <span className="v">{valor}</span>
      <span className="pf-stat-sub">{sub}</span>
    </div>
  );
}

const novaPessoa = n => ({
  nome: '', funcao: '', fone: '', cor: PALETA[n % PALETA.length], ativo: true,
  comissao: 40, comissaoTipo: 'percentual', comissaoFixo: null, jornada: {},
});

/** A ficha de uma pessoa, em cinco partes. Serve também para cadastrar. */
function Ficha({ p, servicos, unidades, doMes, acao, aviso, fechar }) {
  const [f, setF] = useState({ ...p, jornada: { ...p.jornada } });
  const [editandoHorario, setEditandoHorario] = useState(!p.id);
  const [salvando, setSalvando] = useState(false);
  // Quais serviços ela faz, e a exceção de comissão em cada um ('' = herda).
  const [faz, setFaz] = useState(() => servicos.filter(s => s.profs.includes(p.id)).map(s => s.id));
  const [excecao, setExcecao] = useState(() =>
    Object.fromEntries(servicos.map(s => [s.id, s.comissoes?.[p.id] ?? ''])));
  const muda = patch => setF(v => ({ ...v, ...patch }));
  const [buscaServ, setBuscaServ] = useState('');
  // Os que ela já fazia ao abrir vêm primeiro: com catálogo grande, é o que se
  // procura. A ordem é a da abertura, e não a das marcações de agora — senão o
  // item pularia para o topo no instante em que fosse marcado.
  const [jaFazia] = useState(() => new Set(servicos.filter(s => s.profs.includes(p.id)).map(s => s.id)));
  const qs = chave(buscaServ.trim());
  const listaServ = servicos
    .filter(s => !qs || chave(s.nome).includes(qs))
    .sort((a, b) => Number(jaFazia.has(b.id)) - Number(jaFazia.has(a.id)));

  const alternarServico = id => setFaz(l => l.includes(id) ? l.filter(x => x !== id) : [...l, id]);
  const alternarDia = d => setF(v => {
    const j = { ...v.jornada };
    if (j[d]) delete j[d]; else j[d] = ['09:00', '18:00'];
    return { ...v, jornada: j };
  });
  const setHora = (d, i, val) => setF(v => {
    const j = { ...v.jornada };
    const par = [...j[d]]; par[i] = val; j[d] = par;
    return { ...v, jornada: j };
  });

  const fixo = f.comissaoTipo === 'fixo';
  const padrao = fixo ? `${brl(Number(f.comissaoFixo) || 0)} fixo` : `${f.comissao || 0}%`;
  const pctRuim = v => v !== '' && v != null && (Number(v) < 0 || Number(v) > 100);
  const horarioRuim = Object.values(f.jornada).some(([a, b]) => !a || !b || b <= a);
  const problema =
    !f.nome.trim() ? 'Dê um nome à profissional.'
    : fixo && (f.comissaoFixo === '' || f.comissaoFixo == null || Number(f.comissaoFixo) < 0) ? 'Informe o valor fixo da comissão.'
    : !fixo && pctRuim(f.comissao) ? 'A comissão vai de 0 a 100%.'
    : faz.some(id => pctRuim(excecao[id])) ? 'A comissão por serviço vai de 0 a 100%.'
    : horarioRuim ? 'Em algum dia o horário de saída é antes do de entrada.'
    : null;

  const salvar = async e => {
    e.preventDefault();
    if (problema) return aviso?.(problema);
    setSalvando(true);
    const ok = await acao(async () => {
      const salva = await api.salvarProfissional({
        ...f, comissao: Number(f.comissao) || 0,
        comissaoFixo: fixo ? Number(f.comissaoFixo) : null,
      });
      const id = p.id || salva?.id;
      if (id) {
        await api.salvarServicosDaProfissional(id, faz, Object.fromEntries(
          faz.map(sid => [sid, excecao[sid] === '' ? null : Number(excecao[sid])])));
      }
    }, p.id ? 'Profissional salva' : 'Profissional cadastrada');
    setSalvando(false);
    if (ok) fechar();
  };

  const dias = DIAS_SEMANA;

  return (
    <Gaveta onClose={fechar} titulo={p.id ? p.nome : 'Novo profissional'} largura={520}>
      <form onSubmit={salvar} className="pf-ficha">
        <div className="pf-ficha-topo">
          <span className="avatar pf-ficha-av" style={{ background: f.cor }}>{iniciais(f.nome || '?')}</span>
          <div>
            <h2>{f.nome || 'Novo profissional'}</h2>
            <span className={'pf-status ' + (f.ativo ? 'on' : 'off')}>{f.ativo ? 'Ativa' : 'Inativa'}</span>
          </div>
        </div>

        {/* ── Informações ── */}
        <section className="pf-parte">
          <h3 className="pf-parte-t">Informações</h3>
          <Campo label="Nome"><input value={f.nome} onChange={e => muda({ nome: e.target.value })} /></Campo>
          <Campo label="Telefone">
            <input inputMode="tel" value={fmtFone(f.fone)} onChange={e => muda({ fone: soDigitos(e.target.value) })} />
          </Campo>
          {unidades.filter(u => u.ativo).length > 0 && (
            <Campo label="Atende na unidade">
              <select value={f.unidadeId || ''} onChange={e => muda({ unidadeId: e.target.value || null })}>
                <option value="">Todas as unidades</option>
                {unidades.filter(u => u.ativo).map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </Campo>
          )}
          <Campo label="Cor na agenda">
            <div className="pf-cores">
              {PALETA.map(c => (
                <button key={c} type="button" aria-label={`Cor ${c}`} aria-pressed={f.cor === c}
                        className={'pf-cor' + (f.cor === c ? ' on' : '')} style={{ background: c }}
                        onClick={() => muda({ cor: c })} />
              ))}
            </div>
          </Campo>
          <div className="pf-switch">
            <Switch on={!!f.ativo} onChange={() => muda({ ativo: !f.ativo })} />
            <span>Profissional ativo <small>— inativa, some da agenda e do site, e o histórico fica</small></span>
          </div>
        </section>

        {/* ── Serviços habilitados ── */}
        <section className="pf-parte">
          <h3 className="pf-parte-t">Serviços habilitados</h3>
          <p className="add-ajuda">
            O campo ao lado é a comissão dela naquele serviço. Em branco, vale a
            do serviço — ou, se ele não tiver, a padrão dela ({padrao}).
          </p>
          {servicos.length === 0 && <p className="add-ajuda">Cadastre serviços na tela de Serviços primeiro.</p>}
          {servicos.length > 8 && (
            <div className="pf-busca pf-busca-serv">
              <Search size={15} aria-hidden="true" />
              <input placeholder="Buscar serviço…" value={buscaServ} aria-label="Buscar serviço"
                     onChange={e => setBuscaServ(e.target.value)} />
            </div>
          )}
          {/* Caixa com rolagem própria: com trinta serviços, a lista empurraria
              comissão e horários para fora da tela. */}
          <div className="pf-servs">
            {listaServ.length === 0 && <p className="add-ajuda pf-servs-vazio">Nenhum serviço com esse nome.</p>}
            {listaServ.map(s => {
              const on = faz.includes(s.id);
              return (
                <div key={s.id} className={'pf-serv' + (on ? ' on' : '')}>
                  <label className="pf-serv-marca">
                    <input type="checkbox" checked={on} onChange={() => alternarServico(s.id)} />
                    <span className="pf-serv-nome">{s.nome}</span>
                  </label>
                  {on && (
                    <span className="campo-pct pf-serv-pct">
                      <input type="number" min={0} max={100} step="0.5" inputMode="decimal"
                             value={excecao[s.id]} aria-label={`Comissão em ${s.nome}`}
                             placeholder={s.comissao != null ? String(s.comissao) : (fixo ? 'fixo' : String(f.comissao || 0))}
                             onChange={e => setExcecao(v => ({ ...v, [s.id]: e.target.value }))} />
                      <i>%</i>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {servicos.length > 0 && <p className="add-ajuda pf-servs-conta">{faz.length} de {servicos.length} marcados</p>}
        </section>

        {/* ── Comissão ── */}
        <section className="pf-parte">
          <h3 className="pf-parte-t">Comissão</h3>
          <div className="pf-tipo" role="radiogroup" aria-label="Tipo de comissão">
            <label className="pf-opcao">
              <input type="radio" name="tipo" checked={!fixo} onChange={() => muda({ comissaoTipo: 'percentual' })} />
              <span>Percentual</span>
            </label>
            <label className="pf-opcao">
              <input type="radio" name="tipo" checked={fixo} onChange={() => muda({ comissaoTipo: 'fixo' })} />
              <span>Valor fixo</span>
            </label>
          </div>
          <Campo label="Comissão padrão">
            {fixo ? (
              <span className="campo-pre pf-com-campo">
                <i>R$</i>
                <input type="number" min={0} step="0.01" inputMode="decimal" value={f.comissaoFixo ?? ''}
                       onChange={e => muda({ comissaoFixo: e.target.value })} />
              </span>
            ) : (
              <span className="campo-pct pf-com-campo">
                <input type="number" min={0} max={100} step="0.5" inputMode="decimal" value={f.comissao}
                       onChange={e => muda({ comissao: e.target.value })} />
                <i>%</i>
              </span>
            )}
          </Campo>
          <p className="add-ajuda">
            {fixo
              ? 'Por atendimento concluído. Se a cliente pagou só uma parte, sai a mesma parte do fixo. '
              : 'Sobre o que a cliente pagou. '}
            Serviço com comissão própria, ou com exceção para ela acima, passa por cima deste padrão.
          </p>
        </section>

        {/* ── Horários de trabalho ── */}
        <section className="pf-parte">
          <h3 className="pf-parte-t">Horários de trabalho</h3>
          {!editandoHorario ? (
            <>
              <div className="pf-horas">
                {dias.map(([d, nome]) => {
                  const j = f.jornada[d];
                  return (
                    <div key={d} className="pf-hora">
                      <span className="pf-hora-dia">{nome}</span>
                      <span className="pf-hora-barra" aria-hidden="true">
                        {j && <i style={barra(j)} />}
                      </span>
                      <span className="pf-hora-txt mono">{j ? `${j[0]} – ${j[1]}` : ''}</span>
                      <span className={'pf-hora-st ' + (j ? 'on' : 'off')}>{j ? 'Trabalha' : 'Folga'}</span>
                    </div>
                  );
                })}
              </div>
              <button type="button" className="btn btn-g btn-s pf-editar-horas" onClick={() => setEditandoHorario(true)}>
                <Pencil size={14} /> Editar horários
              </button>
            </>
          ) : (
            <div className="pf-horas-edit">
              {dias.map(([d, nome]) => {
                const j = f.jornada[d];
                return (
                  <div key={d} className="pf-hora-edit">
                    <button type="button" className={'pf-dia' + (j ? ' on' : '')} aria-pressed={!!j}
                            onClick={() => alternarDia(d)}>{nome.split('-')[0]}</button>
                    {j ? (
                      <span className="pf-hora-campos">
                        <input type="time" value={j[0]} aria-label={`Entrada ${nome}`} onChange={e => setHora(d, 0, e.target.value)} />
                        <span>até</span>
                        <input type="time" value={j[1]} aria-label={`Saída ${nome}`} onChange={e => setHora(d, 1, e.target.value)} />
                      </span>
                    ) : <span className="pf-folga">Folga</span>}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Desempenho ── */}
        {p.id && (
          <section className="pf-parte">
            <h3 className="pf-parte-t">Desempenho · este mês</h3>
            <div className="pf-desemp">
              <div><span>Atendimentos</span><b>{doMes?.qtd || 0}</b></div>
              <div><span>Produção</span><b className="mono">{brl(doMes?.producao || 0)}</b></div>
              <div><span>Comissão</span><b className="mono">{brl(doMes?.comissaoValor || 0)}</b></div>
            </div>
            <p className="add-ajuda">Atendimentos concluídos no mês, pelo valor vendido.</p>
          </section>
        )}

        {problema && <p className="sv-problema" aria-live="polite">{problema}</p>}

        <div className="sv-botoes pf-botoes">
          <button type="button" className="btn btn-g" onClick={fechar}>Cancelar</button>
          <button type="submit" className="btn btn-p" disabled={salvando || Boolean(problema)}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Gaveta>
  );
}

/** Posição da faixa de horário na régua das 6h às 22h. */
function barra([ini, fim]) {
  const m = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
  const [r0, r1] = REGUA;
  const esq = Math.max(0, (m(ini) - r0) / (r1 - r0));
  const dir = Math.min(1, (m(fim) - r0) / (r1 - r0));
  return { left: `${esq * 100}%`, width: `${Math.max(0, dir - esq) * 100}%` };
}

const soDigitos = s => (s || '').replace(/\D/g, '');
function fmtFone(s) {
  const d = soDigitos(s).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Busca sem acento e sem caixa. */
const chave = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
