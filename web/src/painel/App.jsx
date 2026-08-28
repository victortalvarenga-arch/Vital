import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { api } from '../shared/painel-api.js';
import { brl } from '../shared/formato.js';
import Combos from './Combos.jsx';
import ConfigSite from './ConfigSite.jsx';
import Entrar from './Entrar.jsx';
import Usuarios from './Usuarios.jsx';
import { prepararImagem } from '../shared/imagem.js';
import {
  Calendar, Users, Sparkles, MessageCircle, Wallet, Plus, X, Check, ChevronLeft,
  ChevronRight, Search, Phone, MapPin, Cake, Gift, Clock, Trash2, Pencil, Send,
  ArrowRight, ArrowLeft, User, CreditCard, Banknote, QrCode, Store, Instagram,
  Bell, Megaphone, HeartHandshake, TriangleAlert, ExternalLink, Menu, Globe,
  Upload, Image as ImageIcon, LogOut, KeyRound, Ban, Tag
} from 'lucide-react';

/* ────────────────────────────────────────────────────────────────
   Painel + site público. Todo dado vem da API em server/.
   A tela nunca grava nada direto: chama api.*, depois recarrega o estado.
   ──────────────────────────────────────────────────────────────── */


/* ─────────── utilidades ─────────── */
const uid = () => Math.random().toString(36).slice(2, 9);

const toMin = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
const toHora = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dow = iso => new Date(iso + 'T12:00:00').getDay();
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const fmtData = iso => { const d = new Date(iso + 'T12:00:00'); return `${DIAS[d.getDay()]}, ${d.getDate()} ${MESES[d.getMonth()]}`; };
const fmtDataLonga = iso => { const d = new Date(iso + 'T12:00:00'); return `${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };
const iniciais = n => n.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();
const soDigitos = s => (s || '').replace(/\D/g, '');
const fmtFone = s => { const d = soDigitos(s).slice(0, 11); if (d.length <= 2) return d; if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`; return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; };
const waLink = (fone, texto) => `https://wa.me/55${soDigitos(fone)}?text=${encodeURIComponent(texto)}`;
const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);

const PALETA = ['#A32A4E', '#6A57C7', '#3E7D63', '#A98243', '#C2557A', '#2F6D8C'];

const CAT_COR = { 'Unhas': '#A32A4E', 'Olhar': '#6A57C7', 'Facial': '#3E7D63', 'Corpo': '#A98243' };

/* ─────────── estado vindo do servidor ─────────── */

/**
 * Carrega tudo de uma vez em /api/estado e reexpõe `recarregar()`.
 * Depois de qualquer mutação a tela chama recarregar(): o servidor é a
 * fonte da verdade, então nada de estado otimista divergindo do banco.
 */
function useEstado() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);

  const recarregar = useCallback(async () => {
    try { setDados(await api.estado()); setErro(null); }
    catch (e) { setErro(e.message); }
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);
  return { dados, erro, recarregar };
}

/* ─────────── motor de horários ─────────── */
/**
 * ATENÇÃO: esta função é só para desenhar a grade rápido na tela.
 * A validação que vale é a do servidor (server/src/lib/availability.js).
 * Nunca grave um agendamento confiando só nisto.
 */
function horariosLivres(prof, dataISO, duracao, agendamentos, antecedenciaH = 2) {
  const j = prof.jornada[dow(dataISO)];
  if (!j) return [];
  const [ini, fim] = [toMin(j[0]), toMin(j[1])];
  const ocupados = agendamentos.filter(a => a.prof === prof.id && a.data === dataISO && a.status !== 'cancelado');
  const agora = new Date();
  const limite = dataISO === hojeISO() ? agora.getHours() * 60 + agora.getMinutes() + antecedenciaH * 60 : -1;
  const out = [];
  for (let m = ini; m + duracao <= fim; m += 30) {
    if (m < limite) continue;
    const conflito = ocupados.some(a => m < toMin(a.hora) + a.duracao && m + duracao > toMin(a.hora));
    if (!conflito) out.push(toHora(m));
  }
  return out;
}

function renderTemplate(txt, vars) {
  return txt.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

/* ─────────── UI base ─────────── */
const Modal = ({ children, onClose, wide }) => (
  <div className="ovl" onClick={onClose}>
    <div className={'modal' + (wide ? ' wide' : '')} onClick={e => e.stopPropagation()}>
      <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, color: 'var(--muted)' }} aria-label="Fechar"><X size={20} /></button>
      {children}
    </div>
  </div>
);

const Campo = ({ label, children }) => (<div className="mfield"><label>{label}</label>{children}</div>);

const Switch = ({ on, onChange }) => (
  <button className={'switch' + (on ? ' on' : '')} onClick={onChange} role="switch" aria-checked={on}><i /></button>
);

/* ══════════════════════════════════════════════
   APP
   ══════════════════════════════════════════════ */

export default function App() {
  // `null` = ainda checando a sessão; `false` = deslogado.
  const [sessao, setSessao] = useState(null);

  useEffect(() => {
    api.eu().then(setSessao).catch(() => setSessao(false));
  }, []);

  if (sessao === null) return <div className="p-centro"><p className="p-fraco">Carregando…</p></div>;
  if (sessao === false) return <Entrar aoEntrar={setSessao} />;
  return <Painel sessao={sessao} aoSair={() => setSessao(false)} />;
}

function Painel({ sessao, aoSair }) {
  const { dados, erro, recarregar } = useEstado();
  const [secao, setSecao] = useState('agenda');
  const [menuAberto, setMenuAberto] = useState(false);
  const [toast, setToast] = useState(null);
  const [falha, setFalha] = useState(null);
  const [fila, setFila] = useState({ modoManual: true, itens: [] });

  // A fila é calculada pelo servidor (jobs/mensagens.js). Aqui a gente só lê.
  const carregarFila = useCallback(async () => {
    try { await api.gerarFila(); setFila(await api.fila()); } catch { /* servidor fora */ }
  }, []);
  useEffect(() => { carregarFila(); }, [carregarFila]);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); } }, [toast]);
  useEffect(() => { if (falha) { const t = setTimeout(() => setFalha(null), 4000); return () => clearTimeout(t); } }, [falha]);

  if (erro && !dados) return (
    <div className="p-centro">
      <TriangleAlert size={34} style={{ color: 'var(--p-marca)' }} />
      <h2>Servidor fora do ar</h2>
      <p>Não consegui falar com a API. Rode <code>npm run dev</code> em <code>server/</code> e recarregue.</p>
      <p className="p-fraco">{erro}</p>
    </div>
  );
  if (!dados) return <div className="p-centro"><p className="p-fraco">Carregando…</p></div>;

  /** Executa uma chamada de API, recarrega o estado e avisa em caso de erro. */
  const acao = async (fn, mensagem) => {
    try { await fn(); await recarregar(); if (mensagem) setToast(mensagem); return true; }
    catch (e) { setFalha(e.message); return false; }
  };

  // Esconder o que o papel não pode é cortesia, não segurança: a rota também
  // recusa. Um sem o outro é enganoso — ou dá erro feio, ou deixa passar.
  const p = sessao.poderes;
  const GRUPOS = [
    { titulo: null, itens: [
      { k: 'agenda', nome: 'Calendário', icon: Calendar },
      ...(p.financeiro ? [{ k: 'financeiro', nome: 'Financeiro', icon: Wallet }] : []),
    ] },
    { titulo: 'Cadastros', itens: [
      ...(p.cadastros ? [{ k: 'servicos', nome: 'Serviços', icon: Sparkles }] : []),
      // Sem guarda de papel de propósito: quem atende também cria promoção.
      { k: 'combos', nome: 'Promoções', icon: Tag },
      ...(p.equipe ? [{ k: 'equipe', nome: 'Profissionais', icon: Store }] : []),
      ...(p.cadastros ? [{ k: 'clientes', nome: 'Clientes', icon: Users }] : []),
    ] },
    { titulo: 'Configurações', itens: [
      { k: 'crm', nome: 'Mensagens', icon: MessageCircle, badge: fila.itens.length },
      ...(p.site ? [{ k: 'site', nome: 'Site da cliente', icon: Globe }] : []),
      ...(p.equipe ? [{ k: 'usuarios', nome: 'Acesso ao painel', icon: KeyRound }] : []),
    ] },
  ].filter(g => g.itens.length);

  const atual = GRUPOS.flatMap(g => g.itens).find(i => i.k === secao);
  const irPara = k => { setSecao(k); setMenuAberto(false); };

  return (
    <div className="p-app">
      {/* Barra de topo: no celular é ela que abre o menu. */}
      <header className="p-topo">
        <button className="p-menu-btn" onClick={() => setMenuAberto(v => !v)} aria-label="Menu">
          {menuAberto ? <X size={20} /> : <Menu size={20} />}
        </button>
        <span className="p-titulo">{atual?.nome}</span>
        <a className="p-ver-site" href="/" title="Ver o site"><ExternalLink size={18} /></a>
      </header>

      {menuAberto && <div className="p-veu" onClick={() => setMenuAberto(false)} />}

      <nav className={'p-lado' + (menuAberto ? ' aberto' : '')}>
        <div className="p-marca">
          <span className="p-marca-sigla">{(dados.config.nome || '?').trim()[0].toUpperCase()}</span>
          <span className="p-marca-nome">{dados.config.nome}</span>
        </div>
        {GRUPOS.map((g, i) => (
          <div key={i} className="p-grupo">
            {g.titulo && <div className="p-grupo-t">{g.titulo}</div>}
            {g.itens.map(item => (
              <button key={item.k}
                      className={'p-nav' + (secao === item.k ? ' on' : '')}
                      onClick={() => irPara(item.k)}>
                <item.icon size={18} />
                <span>{item.nome}</span>
                {item.badge > 0 && <span className="p-badge">{item.badge}</span>}
              </button>
            ))}
          </div>
        ))}
        <a className="p-nav p-nav-fim" href="/"><ExternalLink size={18} /><span>Ver o site</span></a>
        <div className="p-eu">
          <div className="p-eu-nome">{sessao.usuario.nome}</div>
          <div className="p-eu-papel">{sessao.usuario.papel}</div>
        </div>
        <button className="p-nav" onClick={async () => { await api.sair(); aoSair(); }}>
          <LogOut size={18} /><span>Sair</span>
        </button>
      </nav>

      <main className="p-conteudo">
        {secao === 'agenda' && (
          <Agenda dados={{ ...dados, eu: sessao.usuario }} acao={acao}
                  aviso={setToast} poderes={p} />
        )}
        {secao === 'clientes' && <Clientes dados={dados} acao={acao} aviso={setToast} />}
        {secao === 'servicos' && <Servicos dados={dados} acao={acao} aviso={setToast} />}
        {secao === 'combos' && <Combos dados={dados} acao={acao} aviso={setFalha} />}
        {secao === 'equipe' && <Equipe dados={dados} acao={acao} aviso={setToast} />}
        {secao === 'crm' && <CRM dados={dados} acao={acao} aviso={setToast} fila={fila} recarregarFila={carregarFila} />}
        {secao === 'financeiro' && p.financeiro && <Financeiro dados={dados} />}
        {secao === 'site' && p.site && <ConfigSite dados={dados} acao={acao} aviso={setFalha} />}
        {secao === 'usuarios' && p.equipe && (
          <Usuarios dados={dados} eu={sessao.usuario} aviso={setFalha} />
        )}
      </main>

      {toast && <div className="p-aviso"><Check size={17} />{toast}</div>}
      {falha && <div className="p-aviso erro"><TriangleAlert size={17} />{falha}</div>}
    </div>
  );
}

/* ── Agenda ── */
const H_INI = 8, H_FIM = 20, PX_H = 56;

function Agenda({ dados, acao, aviso, poderes }) {
  const { staff, servicos, clientes, agendamentos } = dados;
  const [data, setData] = useState(hojeISO());
  const [sel, setSel] = useState(null);
  const [novo, setNovo] = useState(false);
  const [bloquear, setBloquear] = useState(null);

  const doDia = agendamentos.filter(a => a.data === data && a.status !== 'cancelado');
  const fechados = (dados.bloqueios || []).filter(b => b.data === data);
  const ativos = staff.filter(p => p.jornada[dow(data)]);
  const cols = ativos.length || 1;
  const receita = doDia.reduce((s, a) => s + a.valor, 0);

  const mudarStatus = async (id, status) => {
    await acao(() => api.atualizarAgendamento(id, { status }), 'Agendamento atualizado');
    setSel(null);
  };
  const marcarPago = async (id, forma) => {
    await acao(() => api.atualizarAgendamento(id, {
      status: 'concluido', pagamento: { status: 'pago', forma },
    }), 'Pagamento registrado');
    setSel(null);
  };
  const excluir = async id => {
    await acao(() => api.removerAgendamento(id), 'Agendamento removido');
    setSel(null);
  };

  return (
    <>
      <div className="head">
        <div>
          <h2>Agenda</h2>
          <div className="sub">{doDia.length} atendimentos · {brl(receita)} previstos · {ativos.length} profissionais em jornada</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-g btn-s" onClick={() => setData(addDias(data, -1))}><ChevronLeft size={16} /></button>
          <button className="btn btn-g btn-s" style={{ minWidth: 150 }} onClick={() => setData(hojeISO())}>
            {data === hojeISO() ? 'Hoje' : fmtData(data)}
          </button>
          <button className="btn btn-g btn-s" onClick={() => setData(addDias(data, 1))}><ChevronRight size={16} /></button>
          <button className="btn btn-g btn-s" onClick={() => setBloquear({ data })}>
            <Ban size={16} /> Bloquear
          </button>
          <button className="btn btn-p btn-s" onClick={() => setNovo(true)}><Plus size={16} /> Encaixe</button>
        </div>
      </div>

      {ativos.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)' }}>Ninguém trabalha em {fmtData(data)}. Ajuste as jornadas em Equipe.</p>
        </div>
      ) : (
        <div className="agenda">
          <div className="hours">
            <div style={{ height: 39, borderBottom: '1px solid var(--line)' }} />
            {Array.from({ length: H_FIM - H_INI }, (_, i) => <div key={i} className="hcell">{String(H_INI + i).padStart(2, '0')}:00</div>)}
          </div>
          <div className="cols" style={{ gridTemplateColumns: `repeat(${cols},minmax(148px,1fr))` }}>
            {ativos.map(p => (
              <div key={p.id}>
                <div className="colhead">
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: p.cor }} />
                  {p.nome.split(' ')[0]}
                  <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted)' }}>
                    {p.jornada[dow(data)][0]}–{p.jornada[dow(data)][1]}
                  </span>
                </div>
                <div className="colbody" style={{ height: (H_FIM - H_INI) * PX_H }}>
                  {Array.from({ length: H_FIM - H_INI }, (_, i) => <div key={i} className="grid-line" style={{ top: i * PX_H }} />)}

                  {/* Bloqueio entra ATRÁS do agendamento: quando os dois se
                      cruzam, o que importa ver é a cliente que já está marcada. */}
                  {fechados.filter(b => !b.profissionalId || b.profissionalId === p.id).map(b => {
                    const top = (toMin(b.horaIni) - H_INI * 60) / 60 * PX_H;
                    const h = Math.max((toMin(b.horaFim) - toMin(b.horaIni)) / 60 * PX_H, 18);
                    const meu = b.profissionalId === p.id;
                    return (
                      <button key={b.id + p.id} className="bloqueio"
                              style={{ top, height: h }}
                              title={meu ? 'Liberar este horário' : 'Fecha a empresa toda'}
                              disabled={!meu && !poderes.verDeTodos}
                              onClick={() => acao(() => api.removerBloqueio(b.id), 'Horário liberado')}>
                        <span>{b.motivo || 'Bloqueado'}</span>
                      </button>
                    );
                  })}

                  {doDia.filter(a => a.prof === p.id).map(a => {
                    const c = clientes.find(x => x.id === a.cliente);
                    const s = servicos.find(x => x.id === a.servico);
                    const top = (toMin(a.hora) - H_INI * 60) / 60 * PX_H;
                    const h = Math.max(a.duracao / 60 * PX_H - 3, 26);
                    return (
                      <button key={a.id} onClick={() => setSel(a)}
                        className={'appt ' + (a.status === 'concluido' ? 'done' : '') + (a.status === 'falta' ? ' falta' : '')}
                        style={{ top, height: h, background: p.cor + '1f', borderLeftColor: p.cor }}>
                        <b>{c?.nome.split(' ')[0]}</b>
                        <span className="t">{a.hora}</span> · {s?.nome}
                        {a.pagamento.status === 'pago' && <span style={{ color: 'var(--ok)', fontWeight: 700 }}> ✓pago</span>}
                        {/* Só o sinal de que tem extra; a lista inteira está a
                            um toque, no detalhe. A coluna é estreita demais
                            para caber nome de serviço em cima de nome. */}
                        {a.adicionais.length > 0 && (
                          <span className="appt-mais">
                            + {a.adicionais.length === 1
                                 ? a.adicionais[0].nome
                                 : `${a.adicionais.length} adicionais`}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sel && (() => {
        const c = clientes.find(x => x.id === sel.cliente);
        const s = servicos.find(x => x.id === sel.servico);
        const p = staff.find(x => x.id === sel.prof);
        const tplLembrete = dados.templates.find(t => t.chave === 'lembrete_dia');
        const msg = renderTemplate(tplLembrete.texto, {
          cliente: c.nome.split(' ')[0], hora: sel.hora, endereco: dados.config.endereco,
          servico: s.nome, estudio: dados.config.nome, data: fmtData(sel.data), profissional: p.nome.split(' ')[0], valor: brl(sel.valor),
        });
        return (
          <Modal onClose={() => setSel(null)}>
            <div className="eyebrow">{fmtDataLonga(sel.data)} · {sel.hora}</div>
            <h2 style={{ fontSize: 26, margin: '6px 0 4px' }}>{c?.nome}</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: sel.adicionais.length ? 10 : 18 }}>
              {s?.nome} · {sel.duracao} min · com {p?.nome} · <b className="mono">{brl(sel.valor)}</b>
            </p>
            {/* Quem atende precisa saber o que foi comprado junto antes de
                começar — e o valor só fecha com o total quando os extras
                aparecem discriminados. */}
            {sel.adicionais.length > 0 && (
              <div className="extras">
                <span className="eyebrow">Comprou junto</span>
                {sel.adicionais.map(x => (
                  <div key={x.id} className="extras-li">
                    <span>{x.nome}</span>
                    <b className="mono">{brl(x.preco)}</b>
                  </div>
                ))}
              </div>
            )}
            {c?.obs && <div className="card" style={{ padding: 12, fontSize: 13, marginBottom: 16, background: '#FFFBEE', borderColor: '#EBDFAE' }}>📌 {c.obs}</div>}

            <label>Situação</label>
            <div className="chips" style={{ marginBottom: 18 }}>
              {[['agendado', 'Agendado'], ['confirmado', 'Confirmado'], ['concluido', 'Concluído'], ['falta', 'Faltou']].map(([k, n]) => (
                <button key={k} className={'chip' + (sel.status === k ? ' on' : '')} onClick={() => mudarStatus(sel.id, k)}>{n}</button>
              ))}
            </div>

            <label>Pagamento</label>
            {sel.pagamento.status === 'pago'
              ? <div className="card" style={{ padding: 12, fontSize: 14, marginBottom: 18, borderColor: 'var(--ok)' }}>
                  <Check size={15} style={{ verticalAlign: -2, color: 'var(--ok)' }} /> Pago via {sel.pagamento.forma}
                </div>
              : <div className="chips" style={{ marginBottom: 18 }}>
                  {['pix', 'cartao', 'dinheiro'].map(fm => <button key={fm} className="chip" onClick={() => marcarPago(sel.id, fm)}>Receber em {fm}</button>)}
                </div>}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a className="btn btn-wa" href={waLink(c.fone, msg)} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} /> Avisar no WhatsApp</a>
              <button className="btn btn-g" onClick={() => excluir(sel.id)} style={{ color: '#8A2B2B' }}><Trash2 size={16} /> Excluir</button>
            </div>
          </Modal>
        );
      })()}

      {novo && <NovoAgendamento dados={dados} acao={acao} data={data} fechar={() => setNovo(false)} aviso={aviso} />}
      {bloquear && (
        <BloquearHorario dados={dados} poderes={poderes} data={data} acao={acao}
                         aviso={aviso} fechar={() => setBloquear(null)} />
      )}
    </>
  );
}

/**
 * Fecha um pedaço da agenda: almoço, folga, feriado.
 *
 * Bloquear NÃO desmarca ninguém. Se já havia cliente no intervalo, a tela
 * avisa e a equipe remarca à mão — cancelar sozinho o atendimento de alguém
 * seria decidir pela empresa uma coisa que ela precisa saber que aconteceu.
 */
function BloquearHorario({ dados, poderes, data, acao, aviso, fechar }) {
  const [f, setF] = useState({
    // Funcionário só fecha a própria agenda; para ele o campo nem faz escolha.
    profissionalId: poderes.verDeTodos ? '' : (dados.eu?.profissionalId || ''),
    data, horaIni: '12:00', horaFim: '13:00', motivo: '',
  });
  const [ocupado, setOcupado] = useState(false);
  const [conflitos, setConflitos] = useState(null);

  const salvar = async e => {
    e.preventDefault();
    setOcupado(true);
    try {
      const r = await api.criarBloqueio(f);
      if (r.jaAgendados?.length) {
        // Não fecha a janela: a equipe precisa ler quem ficou no meio.
        setConflitos(r.jaAgendados);
        setOcupado(false);
      } else {
        await acao(() => Promise.resolve(), 'Horário bloqueado');
        fechar();
      }
    } catch (erro) {
      aviso(erro.message);
      setOcupado(false);
    }
  };

  if (conflitos) return (
    <Modal onClose={fechar}>
      <h2 style={{ fontSize: 22, marginBottom: 10 }}>Bloqueado, mas atenção</h2>
      <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 16 }}>
        {conflitos.length === 1 ? 'Já havia uma cliente' : `Já havia ${conflitos.length} clientes`} nesse
        intervalo. Ninguém foi desmarcado — combine a remarcação com {conflitos.length === 1 ? 'ela' : 'elas'}.
      </p>
      {conflitos.map(c => (
        <div key={c.id} className="card" style={{ padding: '10px 14px', marginBottom: 8 }}>
          <b className="mono">{c.hora}</b> · {c.cliente}
        </div>
      ))}
      <button className="btn btn-p" style={{ width: '100%', marginTop: 10 }}
              onClick={async () => { await acao(() => Promise.resolve(), 'Horário bloqueado'); fechar(); }}>
        Entendi
      </button>
    </Modal>
  );

  return (
    <Modal onClose={fechar}>
      <form onSubmit={salvar}>
        <h2 style={{ fontSize: 24, marginBottom: 6 }}>Bloquear horário</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13.5, marginBottom: 18 }}>
          O site para de oferecer esse intervalo na hora.
        </p>

        {poderes.verDeTodos && (
          <Campo label="Quem">
            <select value={f.profissionalId}
                    onChange={e => setF(v => ({ ...v, profissionalId: e.target.value }))}>
              <option value="">A empresa toda (feriado, reforma…)</option>
              {dados.staff.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Campo>
        )}

        <Campo label="Dia">
          <input type="date" required value={f.data}
                 onChange={e => setF(v => ({ ...v, data: e.target.value }))} />
        </Campo>

        <div className="mrow">
          <Campo label="Das"><input type="time" required value={f.horaIni}
                 onChange={e => setF(v => ({ ...v, horaIni: e.target.value }))} /></Campo>
          <Campo label="Até"><input type="time" required value={f.horaFim}
                 onChange={e => setF(v => ({ ...v, horaFim: e.target.value }))} /></Campo>
        </div>

        <Campo label="Motivo (aparece só para a equipe)">
          <input placeholder="Almoço, folga, feriado…" value={f.motivo}
                 onChange={e => setF(v => ({ ...v, motivo: e.target.value }))} />
        </Campo>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-p" style={{ flex: 1 }} type="submit" disabled={ocupado}>
            {ocupado ? 'Bloqueando…' : 'Bloquear'}
          </button>
          <button className="btn btn-g" type="button" onClick={fechar}>Cancelar</button>
        </div>
      </form>
    </Modal>
  );
}

function NovoAgendamento({ dados, acao, data, fechar, aviso }) {
  const { servicos, staff, clientes, agendamentos } = dados;
  const [f, setF] = useState({ cliente: '', servico: servicos[0].id, prof: '', data, hora: '' });
  const svc = servicos.find(s => s.id === f.servico);
  const profs = staff.filter(p => svc.profs.includes(p.id));
  const prof = staff.find(p => p.id === f.prof) || profs[0];
  const slots = prof ? horariosLivres(prof, f.data, svc.duracao, agendamentos, 0) : [];

  const salvar = async () => {
    // `forcar: true` deixa o encaixe furar a jornada — é manual, a dona sabe o que faz.
    const ok = await acao(() => api.criarAgendamento({
      cliente: f.cliente, servico: svc.id, prof: prof.id, data: f.data, hora: f.hora, forcar: true,
    }), 'Encaixe criado');
    if (ok) fechar();
  };

  return (
    <Modal onClose={fechar}>
      <h2 style={{ fontSize: 24, marginBottom: 18 }}>Novo encaixe</h2>
      <Campo label="Cliente">
        <select value={f.cliente} onChange={e => setF(v => ({ ...v, cliente: e.target.value }))}>
          <option value="">Selecione</option>
          {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </Campo>
      <Campo label="Serviço">
        <select value={f.servico} onChange={e => setF(v => ({ ...v, servico: e.target.value, prof: '', hora: '' }))}>
          {servicos.map(s => <option key={s.id} value={s.id}>{s.nome} — {brl(s.preco)}</option>)}
        </select>
      </Campo>
      <div className="mrow">
        <Campo label="Profissional">
          <select value={prof?.id || ''} onChange={e => setF(v => ({ ...v, prof: e.target.value, hora: '' }))}>
            {profs.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Campo>
        <Campo label="Data"><input type="date" value={f.data} onChange={e => setF(v => ({ ...v, data: e.target.value, hora: '' }))} /></Campo>
      </div>
      <Campo label="Horário">
        {slots.length === 0
          ? <p style={{ fontSize: 13, color: 'var(--muted)' }}>Sem horário livre nesse dia para {prof?.nome.split(' ')[0]}.</p>
          : <div className="chips">{slots.map(h => <button key={h} className={'chip slot' + (f.hora === h ? ' on' : '')} onClick={() => setF(v => ({ ...v, hora: h }))}>{h}</button>)}</div>}
      </Campo>
      <button className="btn btn-p" style={{ width: '100%', marginTop: 8 }} disabled={!f.cliente || !f.hora} onClick={salvar}>Criar agendamento</button>
    </Modal>
  );
}

/* ── Clientes ── */
function Clientes({ dados, acao, aviso }) {
  const { clientes, agendamentos, servicos, config, templates } = dados;
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [edit, setEdit] = useState(null);

  const enriquecidos = useMemo(() => clientes.map(c => {
    const meus = agendamentos.filter(a => a.cliente === c.id && a.status !== 'cancelado');
    const passados = meus.filter(a => a.data <= hojeISO()).sort((a, b) => b.data.localeCompare(a.data));
    const gasto = meus.filter(a => a.pagamento.status === 'pago').reduce((s, a) => s + a.valor, 0);
    const ultima = passados[0]?.data;
    return { ...c, visitas: passados.length, gasto, ultima, diasSem: ultima ? diasEntre(ultima, hojeISO()) : null };
  }).sort((a, b) => a.nome.localeCompare(b.nome)), [clientes, agendamentos]);

  const filtrados = enriquecidos.filter(c => c.nome.toLowerCase().includes(q.toLowerCase()) || soDigitos(c.fone).includes(soDigitos(q)));

  return (
    <>
      <div className="head">
        <div><h2>Clientes</h2><div className="sub">{clientes.length} cadastradas · cadastro feito uma vez, no primeiro agendamento</div></div>
        <button className="btn btn-p btn-s" onClick={() => setEdit({ nome: '', fone: '', nasc: '', end: '', obs: '' })}><Plus size={16} /> Nova cliente</button>
      </div>
      <div style={{ position: 'relative', marginBottom: 14, maxWidth: 380 }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--muted)' }} />
        <input placeholder="Buscar por nome ou WhatsApp" value={q} onChange={e => setQ(e.target.value)} style={{ paddingLeft: 36 }} />
      </div>
      <div className="card list">
        {filtrados.map(c => (
          <div key={c.id} className="li">
            <div className="avatar" style={{ background: c.diasSem > 60 ? '#B08' : 'var(--ink2)' }}>{iniciais(c.nome)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="nm">{c.nome}</div>
              <div className="mt">
                <span className="mono">{fmtFone(c.fone)}</span>
                <span>{c.visitas} visitas</span>
                <span>{brl(c.gasto)}</span>
                {c.ultima && <span style={{ color: c.diasSem > 60 ? '#A32A4E' : 'inherit' }}>há {c.diasSem}d</span>}
              </div>
            </div>
            <button className="btn btn-g btn-s" onClick={() => setSel(c)}>Ficha</button>
            <a className="btn btn-wa btn-s" href={waLink(c.fone, `Oi ${c.nome.split(' ')[0]}! `)} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} /></a>
          </div>
        ))}
        {filtrados.length === 0 && <div style={{ padding: 34, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Nenhuma cliente com esse nome ou número.</div>}
      </div>

      {sel && (() => {
        const hist = agendamentos.filter(a => a.cliente === sel.id).sort((a, b) => b.data.localeCompare(a.data));
        return (
          <Modal onClose={() => setSel(null)} wide>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 18 }}>
              <div className="avatar" style={{ width: 52, height: 52, fontSize: 18, background: 'var(--ink2)' }}>{iniciais(sel.nome)}</div>
              <div>
                <h2 style={{ fontSize: 26 }}>{sel.nome}</h2>
                <div style={{ fontSize: 13, color: 'var(--muted)' }} className="mono">{fmtFone(sel.fone)}</div>
              </div>
            </div>
            <div className="stats" style={{ marginBottom: 18 }}>
              <div className="card stat"><span className="eyebrow">Visitas</span><span className="v">{sel.visitas}</span></div>
              <div className="card stat"><span className="eyebrow">Total gasto</span><span className="v">{brl(sel.gasto)}</span></div>
              <div className="card stat"><span className="eyebrow">Aniversário</span><span className="v" style={{ fontSize: 20 }}>{sel.nasc ? fmtDataLonga(sel.nasc).slice(0, 5) : '—'}</span></div>
            </div>
            <div className="card" style={{ padding: 14, fontSize: 13.5, lineHeight: 1.7, marginBottom: 16 }}>
              <div><MapPin size={13} style={{ verticalAlign: -2 }} /> {sel.end || 'Endereço não informado'}</div>
              {sel.obs && <div style={{ marginTop: 4 }}>📌 {sel.obs}</div>}
            </div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Histórico</div>
            <div className="card list" style={{ maxHeight: 240, overflowY: 'auto' }}>
              {hist.map(a => {
                const s = servicos.find(x => x.id === a.servico);
                return (
                  <div key={a.id} className="li" style={{ padding: '10px 14px' }}>
                    <span className="mono" style={{ fontSize: 12, color: 'var(--muted)', width: 84 }}>{fmtDataLonga(a.data)}</span>
                    <span style={{ flex: 1, fontSize: 14 }}>{s?.nome}</span>
                    <span className="mono" style={{ fontSize: 13 }}>{brl(a.valor)}</span>
                    {a.status === 'falta' && <span className="tag" style={{ background: '#F3E6E6', color: '#8A2B2B' }}>faltou</span>}
                  </div>
                );
              })}
              {hist.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Ainda sem atendimentos.</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              <a className="btn btn-wa" href={waLink(sel.fone, `Oi ${sel.nome.split(' ')[0]}! `)} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} /> WhatsApp</a>
              <button className="btn btn-g" onClick={() => { setEdit(sel); setSel(null); }}><Pencil size={16} /> Editar cadastro</button>
            </div>
          </Modal>
        );
      })()}

      {edit && <EditarCliente c={edit} acao={acao} fechar={() => setEdit(null)} aviso={aviso} />}
    </>
  );
}

function EditarCliente({ c, acao, fechar, aviso }) {
  const [f, setF] = useState({ nome: c.nome, fone: c.fone, nasc: c.nasc || '', end: c.end || '', obs: c.obs || '' });
  const salvar = async () => {
    const ok = await acao(() => api.salvarCliente({ ...c, ...f, fone: soDigitos(f.fone) }), 'Cadastro salvo');
    if (ok) fechar();
  };
  return (
    <Modal onClose={fechar}>
      <h2 style={{ fontSize: 24, marginBottom: 18 }}>{c.id ? 'Editar cadastro' : 'Nova cliente'}</h2>
      <Campo label="Nome completo"><input value={f.nome} onChange={e => setF(v => ({ ...v, nome: e.target.value }))} /></Campo>
      <div className="mrow">
        <Campo label="WhatsApp"><input value={fmtFone(f.fone)} onChange={e => setF(v => ({ ...v, fone: soDigitos(e.target.value) }))} /></Campo>
        <Campo label="Nascimento"><input type="date" value={f.nasc} onChange={e => setF(v => ({ ...v, nasc: e.target.value }))} /></Campo>
      </div>
      <Campo label="Endereço"><input value={f.end} onChange={e => setF(v => ({ ...v, end: e.target.value }))} /></Campo>
      <Campo label="Observações"><textarea rows={2} value={f.obs} onChange={e => setF(v => ({ ...v, obs: e.target.value }))} placeholder="Alergias, preferências, cuidados" /></Campo>
      <button className="btn btn-p" style={{ width: '100%' }} disabled={f.nome.trim().length < 3} onClick={salvar}>Salvar</button>
    </Modal>
  );
}

/* ── Serviços ── */
function Servicos({ dados, acao, aviso }) {
  const { servicos, staff } = dados;
  const [edit, setEdit] = useState(null);
  return (
    <>
      <div className="head">
        <div><h2>Serviços</h2><div className="sub">{servicos.filter(s => s.ativo).length} ativos no site · preço e duração alimentam a agenda automaticamente</div></div>
        <button className="btn btn-p btn-s" onClick={() => setEdit({ nome: '', cat: '', desc: '', preco: 0, duracao: 60, intervalo: 10, ativo: true, profs: [], foto: '', mostrarPreco: true })}><Plus size={16} /> Novo serviço</button>
      </div>
      <div className="card list">
        {servicos.map(s => (
          <div key={s.id} className="li">
            <span className="dot" style={{ background: CAT_COR[s.cat] || '#999', marginTop: 0, width: 12, height: 12 }} />
            <div style={{ flex: 1 }}>
              <div className="nm">{s.nome} {!s.ativo && <span className="tag" style={{ background: '#EEE', color: '#777' }}>oculto</span>}</div>
              <div className="mt"><span>{s.cat}</span><span>{s.duracao} min</span>
                <span>{s.profs.map(p => staff.find(x => x.id === p)?.nome.split(' ')[0]).join(', ') || 'sem profissional'}</span></div>
            </div>
            <span className="mono" style={{ fontWeight: 600 }}>{brl(s.preco)}</span>
            <button className="btn btn-g btn-s" onClick={() => setEdit(s)}><Pencil size={15} /></button>
          </div>
        ))}
      </div>
      {edit && <EditarServico s={edit} staff={staff} servicos={servicos} acao={acao}
                              fechar={() => setEdit(null)} aviso={aviso}
                              categorias={[...new Set(servicos.map(x => x.cat).filter(Boolean))].sort()} />}
    </>
  );
}

function EditarServico({ s, staff, servicos = [], acao, fechar, aviso, categorias = [] }) {
  const [f, setF] = useState({ ...s });
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
  const toggleProf = id => setF(v => ({ ...v, profs: v.profs.includes(id) ? v.profs.filter(x => x !== id) : [...v.profs, id] }));

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

  const salvar = async () => {
    const ok = await acao(async () => {
      // Serviço novo só ganha id ao ser criado, e os extras precisam dele.
      const salvo = await api.salvarServico(f);
      const id = s.id || salvo?.id;
      if (ofertados && id) await api.salvarAdicionaisDoServico(id, ofertados);
      if (ondeSouExtra && id) await api.salvarCategoriasDoAdicional(id, ondeSouExtra);
    }, 'Serviço salvo');
    if (ok) fechar();
  };

  const enviarFoto = async e => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setSubindo(true);
    try {
      const dataUrl = await prepararImagem(arquivo, { largura: 900 });
      const { url } = await api.enviarImagem(dataUrl, 'servico');
      setF(v => ({ ...v, foto: url }));
    } catch (erro) {
      aviso?.(erro.message);
    } finally {
      setSubindo(false);
    }
  };

  return (
    <Modal onClose={fechar}>
      <h2 style={{ fontSize: 24, marginBottom: 18 }}>{s.id ? 'Editar serviço' : 'Novo serviço'}</h2>
      <Campo label="Nome"><input value={f.nome} onChange={e => setF(v => ({ ...v, nome: e.target.value }))} /></Campo>
      <Campo label="Descrição (aparece no site)"><textarea rows={2} value={f.desc} onChange={e => setF(v => ({ ...v, desc: e.target.value }))} /></Campo>

      <Campo label="Foto (aparece no site)">
        <div className="svc-foto-campo">
          <div className="svc-foto-previa">
            {f.foto ? <img src={f.foto} alt="" /> : <ImageIcon size={18} />}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-g btn-s" disabled={subindo} onClick={() => entradaFoto.current?.click()}>
              <Upload size={14} /> {subindo ? 'Enviando…' : f.foto ? 'Trocar' : 'Enviar'}
            </button>
            {f.foto && <button className="btn btn-g btn-s" onClick={() => setF(v => ({ ...v, foto: '' }))}><Trash2 size={14} /></button>}
          </div>
          <input ref={entradaFoto} type="file" accept="image/*" hidden onChange={enviarFoto} />
        </div>
      </Campo>

      <div className="mrow">
        <Campo label="Categoria">
          {/* Texto livre com sugestões, não lista fixa: cada ramo tem os
              próprios grupos, e uma lista no código só serviria a um deles. */}
          <input list="categorias-existentes" value={f.cat}
                 placeholder="Ex.: Unhas"
                 onChange={e => setF(v => ({ ...v, cat: e.target.value }))} />
          <datalist id="categorias-existentes">
            {categorias.map(c => <option key={c} value={c} />)}
          </datalist>
        </Campo>
        <Campo label="Preço (R$)"><input type="number" value={f.preco} onChange={e => setF(v => ({ ...v, preco: +e.target.value }))} /></Campo>
      </div>
      <Campo label="Duração (minutos)"><input type="number" step={15} value={f.duracao} onChange={e => setF(v => ({ ...v, duracao: +e.target.value }))} /></Campo>
      <Campo label="Quem executa">
        <div className="chips">
          {staff.map(p => <button key={p.id} className={'chip' + (f.profs.includes(p.id) ? ' on' : '')} onClick={() => toggleProf(p.id)}>{p.nome.split(' ')[0]}</button>)}
        </div>
      </Campo>
      {carregando ? (
        <Campo label="Serviços adicionais"><p className="add-ajuda">Carregando…</p></Campo>
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
                    <button key={c}
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
                    <button key={x.id}
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
              sozinho — depilação de buço junto de qualquer facial, por exemplo.
            </p>
            {categorias.length === 0
              ? <p className="add-ajuda">Cadastre uma categoria em algum serviço primeiro.</p>
              : (
                <div className="chips">
                  {categorias.map(c => (
                    <button key={c}
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Switch on={f.ativo} onChange={() => setF(v => ({ ...v, ativo: !v.ativo }))} />
        <span style={{ fontSize: 14 }}>Visível no site</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <Switch on={f.mostrarPreco !== false} onChange={() => setF(v => ({ ...v, mostrarPreco: v.mostrarPreco === false }))} />
        <span style={{ fontSize: 14 }}>Mostrar o preço <span style={{ color: 'var(--muted)' }}>— desligado, aparece “Sob consulta”</span></span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-p" style={{ flex: 1 }} disabled={!f.nome || f.profs.length === 0} onClick={salvar}>Salvar</button>
        {s.id && <button className="btn btn-g" style={{ color: '#8A2B2B' }} onClick={async () => { await acao(() => api.removerServico(s.id), 'Serviço removido'); fechar(); }}><Trash2 size={16} /></button>}
      </div>
    </Modal>
  );
}

/* ── Equipe ── */
function Equipe({ dados, acao, aviso }) {
  const { staff, agendamentos, servicos } = dados;
  const [edit, setEdit] = useState(null);
  const mesAtual = hojeISO().slice(0, 7);

  return (
    <>
      <div className="head">
        <div><h2>Equipe</h2><div className="sub">Jornada, comissão e produção do mês</div></div>
        <button className="btn btn-p btn-s" onClick={() => setEdit({ nome: '', funcao: '', fone: '', cor: PALETA[staff.length % 6], comissao: 40, jornada: {} })}><Plus size={16} /> Nova profissional</button>
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))' }}>
        {staff.map(p => {
          const meus = agendamentos.filter(a => a.prof === p.id && a.data.startsWith(mesAtual) && a.status === 'concluido');
          const prod = meus.reduce((s, a) => s + a.valor, 0);
          const dias = Object.keys(p.jornada).map(Number).sort();
          return (
            <div key={p.id} className="card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
                <div className="avatar" style={{ background: p.cor, width: 44, height: 44, fontSize: 16 }}>{iniciais(p.nome)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{p.nome}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.funcao}</div>
                </div>
                <button className="btn btn-g btn-s" onClick={() => setEdit(p)}><Pencil size={15} /></button>
              </div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
                {[0, 1, 2, 3, 4, 5, 6].map(d => (
                  <div key={d} title={p.jornada[d] ? `${p.jornada[d][0]}–${p.jornada[d][1]}` : 'folga'}
                    style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 700, padding: '6px 0', borderRadius: 7,
                      background: p.jornada[d] ? p.cor + '22' : 'transparent', color: p.jornada[d] ? p.cor : '#C9BCC5',
                      border: '1px solid ' + (p.jornada[d] ? 'transparent' : 'var(--line)') }}>
                    {DIAS[d].toUpperCase()}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 18, fontSize: 13 }}>
                <div><div className="eyebrow">Produção/mês</div><b className="mono">{brl(prod)}</b></div>
                <div><div className="eyebrow">Comissão {p.comissao}%</div><b className="mono">{brl(prod * p.comissao / 100)}</b></div>
              </div>
            </div>
          );
        })}
      </div>
      {edit && <EditarStaff p={edit} acao={acao} fechar={() => setEdit(null)} aviso={aviso} />}
    </>
  );
}

function EditarStaff({ p, acao, fechar, aviso }) {
  const [f, setF] = useState({ ...p, jornada: { ...p.jornada } });
  const toggleDia = d => setF(v => {
    const j = { ...v.jornada };
    if (j[d]) delete j[d]; else j[d] = ['09:00', '18:00'];
    return { ...v, jornada: j };
  });
  const setHora = (d, i, val) => setF(v => { const j = { ...v.jornada }; const par = [...j[d]]; par[i] = val; j[d] = par; return { ...v, jornada: j }; });
  const salvar = async () => {
    const ok = await acao(() => api.salvarProfissional(f), 'Profissional salva');
    if (ok) fechar();
  };
  return (
    <Modal onClose={fechar} wide>
      <h2 style={{ fontSize: 24, marginBottom: 18 }}>{p.id ? 'Editar profissional' : 'Nova profissional'}</h2>
      <div className="mrow">
        <Campo label="Nome"><input value={f.nome} onChange={e => setF(v => ({ ...v, nome: e.target.value }))} /></Campo>
        <Campo label="Função"><input value={f.funcao} onChange={e => setF(v => ({ ...v, funcao: e.target.value }))} placeholder="Ex.: Cílios e sobrancelhas" /></Campo>
      </div>
      <div className="mrow">
        <Campo label="WhatsApp"><input value={fmtFone(f.fone)} onChange={e => setF(v => ({ ...v, fone: soDigitos(e.target.value) }))} /></Campo>
        <Campo label="Comissão (%)"><input type="number" value={f.comissao} onChange={e => setF(v => ({ ...v, comissao: +e.target.value }))} /></Campo>
      </div>
      <Campo label="Cor na agenda">
        <div className="chips">{PALETA.map(c => (
          <button key={c} onClick={() => setF(v => ({ ...v, cor: c }))} aria-label={c}
            style={{ width: 32, height: 32, borderRadius: '50%', background: c, border: f.cor === c ? '3px solid var(--ink)' : '3px solid transparent' }} />
        ))}</div>
      </Campo>
      <label>Jornada de trabalho</label>
      <div style={{ display: 'grid', gap: 6, marginBottom: 18 }}>
        {[1, 2, 3, 4, 5, 6, 0].map(d => (
          <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className={'chip' + (f.jornada[d] ? ' on' : '')} style={{ width: 74, justifyContent: 'center' }} onClick={() => toggleDia(d)}>
              {DIAS[d]}
            </button>
            {f.jornada[d] ? (
              <>
                <input type="time" style={{ width: 118 }} value={f.jornada[d][0]} onChange={e => setHora(d, 0, e.target.value)} />
                <span style={{ color: 'var(--muted)' }}>até</span>
                <input type="time" style={{ width: 118 }} value={f.jornada[d][1]} onChange={e => setHora(d, 1, e.target.value)} />
              </>
            ) : <span style={{ fontSize: 13, color: 'var(--muted)' }}>Folga</span>}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-p" style={{ flex: 1 }} disabled={!f.nome} onClick={salvar}>Salvar</button>
        {p.id && <button className="btn btn-g" style={{ color: '#8A2B2B' }} onClick={async () => { await acao(() => api.removerProfissional(p.id), 'Profissional removida'); fechar(); }}><Trash2 size={16} /></button>}
      </div>
    </Modal>
  );
}

/* ── CRM / WhatsApp ── */
function CRM({ dados, acao, aviso, fila, recarregarFila }) {
  const [sub, setSub] = useState('fila');
  const [edit, setEdit] = useState(null);
  const { templates, clientes } = dados;
  const pendentes = fila.itens;

  const enviar = async (m) => {
    window.open(m.link, '_blank', 'noopener');
    try { await api.marcarEnviada(m.id); } catch { /* ignora */ }
    recarregarFila();
  };
  const pular = async (id) => {
    try { await api.pularMensagem(id); } catch { /* ignora */ }
    recarregarFila();
  };

  return (
    <>
      <div className="head">
        <div><h2>WhatsApp</h2><div className="sub">Mensagens automáticas e campanhas para a base de clientes</div></div>
        <div className="chips">
          <button className={'chip' + (sub === 'fila' ? ' on' : '')} onClick={() => setSub('fila')}>Fila de hoje ({pendentes.length})</button>
          <button className={'chip' + (sub === 'auto' ? ' on' : '')} onClick={() => setSub('auto')}>Automações</button>
          <button className={'chip' + (sub === 'camp' ? ' on' : '')} onClick={() => setSub('camp')}>Campanhas</button>
        </div>
      </div>

      {sub === 'fila' && (
        <>
          <div className="card" style={{ padding: 14, marginBottom: 16, fontSize: 13, lineHeight: 1.55, background: '#F3F0F7', borderColor: '#D9D1EC' }}>
            <b>Como funciona no sistema real:</b> essas mensagens saem sozinhas pela API oficial do WhatsApp Business, nos horários programados.
            Aqui na demonstração cada uma tem um botão que abre a conversa já com o texto pronto, pra você conferir o tom antes de automatizar.
          </div>
          {pendentes.length === 0
            ? <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Fila zerada. Nada para enviar hoje.</div>
            : pendentes.map(f => (
              <div key={f.id} className="card" style={{ padding: 16, marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                  <div className="avatar" style={{ background: 'var(--uv)', width: 34, height: 34 }}><Bell size={16} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5 }}>{f.clienteNome}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{f.titulo} · <span className="mono">{fmtFone(f.fone)}</span> · programada {f.agendadoPara.slice(11)}</div>
                  </div>
                  <button className="btn btn-wa btn-s" onClick={() => enviar(f)}>
                    <Send size={14} /> Enviar
                  </button>
                  <button className="btn btn-g btn-s" onClick={() => pular(f.id)}>Pular</button>
                </div>
                <div className="bubble" style={{ background: '#F4F0F1' }}>{f.texto}</div>
              </div>
            ))}
        </>
      )}

      {(sub === 'auto' || sub === 'camp') && (
        <div style={{ display: 'grid', gap: 12 }}>
          {templates.filter(t => t.tipo === (sub === 'auto' ? 'auto' : 'campanha')).map(t => (
            <div key={t.id} className="card auto">
              <div className="auto-l">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <h3 style={{ fontSize: 19, flex: 1 }}>{t.titulo}</h3>
                  <Switch on={t.ativo} onChange={() => acao(() => api.salvarTemplate(t.id, { ativo: !t.ativo }))} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={13} /> {t.quando}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                  <button className="btn btn-g btn-s" onClick={() => setEdit(t)}><Pencil size={14} /> Editar texto</button>
                  {t.tipo === 'campanha' && (
                    <button className="btn btn-d btn-s" onClick={() => setEdit({ ...t, disparo: true })}>
                      <Megaphone size={14} /> Disparar para {clientes.length} clientes
                    </button>
                  )}
                </div>
              </div>
              <div className="auto-r">
                <div className="eyebrow">Prévia</div>
                <div className="bubble">{t.texto}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {edit && (edit.disparo
        ? <Disparo t={edit} dados={dados} fechar={() => setEdit(null)} recarregarFila={recarregarFila} aviso={aviso} />
        : <EditarTemplate t={edit} acao={acao} fechar={() => setEdit(null)} aviso={aviso} />)}
    </>
  );
}

function EditarTemplate({ t, acao, fechar, aviso }) {
  const [txt, setTxt] = useState(t.texto);
  const VARS = ['cliente', 'servico', 'profissional', 'data', 'hora', 'valor', 'estudio', 'endereco', 'link', 'dias'];
  const ref = useRef(null);
  const inserir = v => {
    const el = ref.current; const p = el.selectionStart;
    setTxt(txt.slice(0, p) + `{${v}}` + txt.slice(el.selectionEnd));
    setTimeout(() => { el.focus(); el.selectionStart = el.selectionEnd = p + v.length + 2; }, 0);
  };
  return (
    <Modal onClose={fechar} wide>
      <h2 style={{ fontSize: 24, marginBottom: 4 }}>{t.titulo}</h2>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>{t.quando}</p>
      <Campo label="Mensagem">
        <textarea ref={ref} rows={9} value={txt} onChange={e => setTxt(e.target.value)} style={{ lineHeight: 1.6 }} />
      </Campo>
      <Campo label="Inserir informação da cliente">
        <div className="chips">{VARS.map(v => <button key={v} className="chip btn-s mono" style={{ fontSize: 12 }} onClick={() => inserir(v)}>{'{' + v + '}'}</button>)}</div>
      </Campo>
      <button className="btn btn-p" style={{ width: '100%' }} onClick={async () => { await acao(() => api.salvarTemplate(t.id, { texto: txt }), 'Mensagem salva'); fechar(); }}>
        Salvar mensagem
      </button>
    </Modal>
  );
}

function Disparo({ t, dados, fechar, recarregarFila, aviso }) {
  const { clientes, config, agendamentos, servicos } = dados;
  const [sel, setSel] = useState(clientes.map(c => c.id));
  const toggle = id => setSel(v => v.includes(id) ? v.filter(x => x !== id) : [...v, id]);
  const texto = c => renderTemplate(t.texto, {
    cliente: c.nome.split(' ')[0], estudio: config.nome, endereco: config.endereco,
    data: fmtData(hojeISO()), hora: '15:00', servico: servicos[0].nome, valor: brl(servicos[0].preco), link: 'g.page/estudiolume', profissional: '', dias: '',
  });
  return (
    <Modal onClose={fechar} wide>
      <h2 style={{ fontSize: 24, marginBottom: 4 }}>{t.titulo}</h2>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>Escolha quem recebe. {sel.length} de {clientes.length} selecionadas.</p>
      <div className="card list" style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
        {clientes.map(c => (
          <div key={c.id} className="li" style={{ padding: '10px 14px' }}>
            <button className={'chip' + (sel.includes(c.id) ? ' on' : '')} style={{ width: 34, height: 34, padding: 0, justifyContent: 'center' }} onClick={() => toggle(c.id)}>
              {sel.includes(c.id) ? <Check size={15} /> : ''}
            </button>
            <span style={{ flex: 1, fontSize: 14 }}>{c.nome}</span>
            <a className="btn btn-wa btn-s" href={waLink(c.fone, texto(c))} target="_blank" rel="noopener noreferrer"><Send size={14} /></a>
            {!c.optin && <span className="tag" style={{ background: '#EEE', color: '#777' }}>sem opt-in</span>}
          </div>
        ))}
      </div>
      <button className="btn btn-p" style={{ width: '100%', marginBottom: 12 }}
        onClick={async () => {
          try {
            const r = await api.dispararCampanha(t.chave, sel);
            aviso(`${r.enfileiradas} mensagens na fila${r.ignoradas ? ` · ${r.ignoradas} ignoradas` : ''}`);
            recarregarFila(); fechar();
          } catch (e) { aviso(e.message); }
        }}>
        <Megaphone size={16} /> Colocar {sel.length} na fila
      </button>
      <div className="card" style={{ padding: 13, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55 }}>
        Quem não deu opt-in fica de fora automaticamente. Com a API oficial, campanha exige template aprovado pela Meta na categoria marketing.
      </div>
    </Modal>
  );
}

/* ── Financeiro ── */
function Financeiro({ dados }) {
  const { staff } = dados;
  const mes = hojeISO().slice(0, 7);
  const [r, setR] = useState(null);

  // Agregação é trabalho de banco, não de navegador: SUM/GROUP BY no servidor.
  useEffect(() => { api.resumo(mes).then(setR).catch(() => setR(null)); }, [mes]);

  if (!r) return <div style={{ padding: 40, color: 'var(--muted)' }}>Calculando…</div>;

  const recebido = r.recebido, aberto = r.aReceber, hojeReceita = r.previstoHoje;
  const ticket = r.ticketMedio, faltas = r.faltas;
  const rank = r.porServico.map(s => [s.nome, s.total]);
  const max = rank[0]?.[1] || 1;
  const formas = Object.fromEntries(r.porForma.map(f => [f.forma, f.total]));
  const producaoPor = Object.fromEntries(r.porProfissional.map(p => [p.id, p.producao]));

  return (
    <>
      <div className="head"><div><h2>Financeiro</h2><div className="sub">Mês de {MESES[+mes.slice(5) - 1]} · {r.atendimentos} atendimentos concluídos</div></div></div>

      <div className="stats" style={{ marginBottom: 18 }}>
        <div className="card stat"><span className="eyebrow">Recebido no mês</span><span className="v">{brl(recebido)}</span></div>
        <div className="card stat"><span className="eyebrow">Previsto hoje</span><span className="v">{brl(hojeReceita)}</span></div>
        <div className="card stat"><span className="eyebrow">A receber</span><span className="v" style={{ color: aberto > 0 ? 'var(--warn)' : 'inherit' }}>{brl(aberto)}</span></div>
        <div className="card stat"><span className="eyebrow">Ticket médio</span><span className="v">{brl(ticket)}</span></div>
        <div className="card stat"><span className="eyebrow">Faltas no mês</span><span className="v">{faltas}</span></div>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>O que mais dá dinheiro</div>
          {rank.map(([nome, v]) => (
            <div key={nome} style={{ marginBottom: 11 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span>{nome}</span><span className="mono" style={{ fontWeight: 600 }}>{brl(v)}</span>
              </div>
              <div style={{ height: 6, background: 'var(--line)', borderRadius: 6 }}>
                <div style={{ height: 6, width: `${v / max * 100}%`, background: 'var(--lacquer)', borderRadius: 6 }} />
              </div>
            </div>
          ))}
          {rank.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Sem atendimentos concluídos neste mês ainda.</p>}
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Comissões do mês</div>
          {staff.map(p => {
            const prod = producaoPor[p.id] || 0;
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
                <div className="avatar" style={{ background: p.cor, width: 30, height: 30, fontSize: 11 }}>{iniciais(p.nome)}</div>
                <div style={{ flex: 1, fontSize: 13.5 }}>{p.nome.split(' ')[0]}
                  <span style={{ color: 'var(--muted)' }}> · produziu {brl(prod)}</span></div>
                <b className="mono" style={{ fontSize: 13.5 }}>{brl(prod * p.comissao / 100)}</b>
              </div>
            );
          })}
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Como entrou</div>
          {Object.entries(formas).map(([f, v]) => (
            <div key={f} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
              <span style={{ textTransform: 'capitalize' }}>{f}</span><b className="mono">{brl(v)}</b>
            </div>
          ))}
          {Object.keys(formas).length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Nenhum pagamento registrado.</p>}
        </div>
      </div>
    </>
  );
}

