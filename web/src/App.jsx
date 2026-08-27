import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { api } from './api.js';
import './styles.css';
import {
  Calendar, Users, Sparkles, MessageCircle, Wallet, Plus, X, Check, ChevronLeft,
  ChevronRight, Search, Phone, MapPin, Cake, Gift, Clock, Trash2, Pencil, Send,
  ArrowRight, ArrowLeft, User, CreditCard, Banknote, QrCode, Store, Instagram,
  Bell, Megaphone, HeartHandshake, TriangleAlert, ExternalLink
} from 'lucide-react';

/* ────────────────────────────────────────────────────────────────
   Painel + site público. Todo dado vem da API em server/.
   A tela nunca grava nada direto: chama api.*, depois recarrega o estado.
   ──────────────────────────────────────────────────────────────── */


/* ─────────── utilidades ─────────── */
const uid = () => Math.random().toString(36).slice(2, 9);
const brl = n => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
  const { dados, erro, recarregar } = useEstado();
  const [modo, setModo] = useState('site');
  const [toast, setToast] = useState(null);
  const [falha, setFalha] = useState(null);

  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); } }, [toast]);
  useEffect(() => { if (falha) { const t = setTimeout(() => setFalha(null), 4000); return () => clearTimeout(t); } }, [falha]);

  if (erro && !dados) return (
    <div className="est" style={{ display: 'grid', placeItems: 'center', height: '100vh', textAlign: 'center', padding: 24 }}>
      <div>
        <TriangleAlert size={34} style={{ color: 'var(--lacquer)' }} />
        <h2 style={{ fontSize: 22, margin: '12px 0 6px' }}>Servidor fora do ar</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, maxWidth: 380 }}>
          Não consegui falar com a API. Rode <code>npm run dev</code> dentro de <code>server/</code> e recarregue a página.
        </p>
        <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>{erro}</p>
      </div>
    </div>
  );

  if (!dados) return (
    <div className="est" style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
      <p style={{ color: 'var(--muted)' }}>Carregando…</p>
    </div>
  );

  /** Executa uma chamada de API, recarrega o estado e avisa em caso de erro. */
  const acao = async (fn, mensagem) => {
    try { await fn(); await recarregar(); if (mensagem) setToast(mensagem); return true; }
    catch (e) { setFalha(e.message); return false; }
  };

  return (
    <div className="est">
      {modo === 'site'
        ? <Site dados={dados} acao={acao} irPainel={() => setModo('painel')} aviso={setToast} />
        : <Painel dados={dados} acao={acao} recarregar={recarregar} irSite={() => setModo('site')} aviso={setToast} />}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
      {falha && <div className="toast" style={{ background: '#8A2B2B' }}><TriangleAlert size={17} />{falha}</div>}
    </div>
  );
}

/* ══════════════════════════════════════════════
   SITE PÚBLICO
   ══════════════════════════════════════════════ */
function Site({ dados, acao, irPainel, aviso }) {
  const { config, servicos, staff, clientes, agendamentos } = dados;
  const [tela, setTela] = useState('home');
  const [ag, setAg] = useState({});
  const cats = [...new Set(servicos.filter(s => s.ativo).map(s => s.cat))];

  const iniciar = svc => { setAg({ servico: svc.id }); setTela('fluxo'); window.scrollTo(0, 0); };

  return (
    <div>
      <header className="site-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--lacquer)', display: 'grid', placeItems: 'center' }}>
            <Sparkles size={17} color="#fff" />
          </div>
          <div>
            <div className="disp" style={{ fontSize: 16, lineHeight: 1 }}>{config.nome}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '.06em' }}>{config.slogan}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-g btn-s" onClick={irPainel}>Área da equipe</button>
          {tela === 'home' && <button className="btn btn-p btn-s" onClick={() => setTela('fluxo')}>Agendar</button>}
        </div>
      </header>

      {tela === 'home' && (
        <>
          <section className="hero">
            <div className="hero-in">
              <div className="swatches" aria-hidden="true">
                {cats.map(c => <div key={c} className="swatch" style={{ background: CAT_COR[c] || '#A32A4E' }} />)}
              </div>
              <div>
                <div className="eyebrow" style={{ marginBottom: 14 }}>Agenda aberta · {config.janelaDias} dias</div>
                <h1>Escolha o serviço,<br />escolha a hora.<br /><em>Pronto.</em></h1>
                <p>Sem ligação, sem esperar resposta. Você reserva em menos de um minuto e recebe a confirmação no WhatsApp na hora.</p>
                <button className="btn btn-p" onClick={() => setTela('fluxo')}>Agendar horário <ArrowRight size={17} /></button>
              </div>
            </div>
          </section>

          <section className="sec">
            <div className="eyebrow">O que fazemos</div>
            <h2 style={{ fontSize: 32, marginTop: 6 }}>Serviços e valores</h2>
            {cats.map(cat => (
              <div key={cat} style={{ marginTop: 30 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span className="dot" style={{ background: CAT_COR[cat], marginTop: 0 }} />
                  <h3 style={{ fontSize: 21 }}>{cat}</h3>
                </div>
                <div className="svc-grid">
                  {servicos.filter(s => s.ativo && s.cat === cat).map(s => (
                    <div key={s.id} className="card svc">
                      <div className="svc-top"><h3>{s.nome}</h3></div>
                      {s.desc && <p className="desc">{s.desc}</p>}
                      <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Clock size={13} /> {s.duracao} min
                      </div>
                      <div className="svc-foot">
                        <span className="price mono">{brl(s.preco)}</span>
                        <button className="btn btn-g btn-s" onClick={() => iniciar(s)}>Agendar</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section className="sec" style={{ paddingTop: 0 }}>
            <div className="card" style={{ padding: 26, display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
              <div>
                <div className="eyebrow">Quem atende</div>
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {staff.map(p => (
                    <div key={p.id} style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
                      <div className="avatar" style={{ background: p.cor }}>{iniciais(p.nome)}</div>
                      <div><div style={{ fontWeight: 600, fontSize: 14 }}>{p.nome}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.funcao}</div></div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="eyebrow">Onde ficamos</div>
                <p style={{ fontSize: 14, marginTop: 12, lineHeight: 1.6 }}>
                  <MapPin size={14} style={{ verticalAlign: -2 }} /> {config.endereco}<br />
                  <Phone size={14} style={{ verticalAlign: -2 }} /> <span className="mono">{fmtFone(config.fone)}</span><br />
                  <Instagram size={14} style={{ verticalAlign: -2 }} /> @{config.instagram}
                </p>
              </div>
            </div>
          </section>
          <footer style={{ textAlign: 'center', padding: '30px 20px 40px', fontSize: 12, color: 'var(--muted)' }}>
            © {new Date().getFullYear()} {config.nome}
          </footer>
        </>
      )}

      {tela === 'fluxo' && (
        <Fluxo dados={dados} acao={acao} inicial={ag} aviso={aviso} sair={() => { setTela('home'); window.scrollTo(0, 0); }} />
      )}
    </div>
  );
}

/* ── fluxo de agendamento do cliente ── */
function Fluxo({ dados, acao, inicial, sair, aviso }) {
  const { config, servicos, staff, clientes, agendamentos } = dados;
  const [passo, setPasso] = useState(inicial.servico ? 2 : 1);
  const [f, setF] = useState({ servico: inicial.servico || null, prof: null, data: hojeISO(), hora: null, fone: '', pagamento: null });
  const [cliente, setCliente] = useState(null);
  const [novo, setNovo] = useState({ nome: '', nasc: '', end: '' });
  const [buscou, setBuscou] = useState(false);
  const [feito, setFeito] = useState(null);

  const svc = servicos.find(s => s.id === f.servico);
  const profs = svc ? staff.filter(p => svc.profs.includes(p.id)) : [];
  const prof = staff.find(p => p.id === f.prof);
  const dias = useMemo(() => Array.from({ length: config.janelaDias }, (_, i) => addDias(hojeISO(), i)), [config.janelaDias]);
  const [slots, setSlots] = useState([]);
  const [carregandoSlots, setCarregandoSlots] = useState(false);

  // Os horários vêm do servidor, não do cache local: outra pessoa pode ter
  // acabado de marcar enquanto esta tela estava aberta.
  useEffect(() => {
    if (!prof || !svc) return setSlots([]);
    let cancelado = false;
    setCarregandoSlots(true);
    api.horarios({ servicoId: svc.id, profissionalId: prof.id, data: f.data })
      .then(r => { if (!cancelado) setSlots(r.horarios || []); })
      .catch(() => { if (!cancelado) setSlots([]); })
      .finally(() => { if (!cancelado) setCarregandoSlots(false); });
    return () => { cancelado = true; };
  }, [prof?.id, svc?.id, f.data]);

  useEffect(() => { if (profs.length === 1 && !f.prof) setF(v => ({ ...v, prof: profs[0].id })); }, [f.servico]);

  const [buscando, setBuscando] = useState(false);

  const buscar = async () => {
    const d = soDigitos(f.fone);
    if (d.length < 10) return;
    setBuscando(true);
    try {
      const r = await api.identificar(d);
      setCliente(r.cadastrada ? { id: r.id, nome: r.primeiroNome } : null);
    } catch { setCliente(null); }
    setBuscando(false);
    setBuscou(true);
  };

  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState(null);

  const confirmar = async () => {
    setEnviando(true); setErroEnvio(null);
    try {
      await api.agendarPublico({
        fone: soDigitos(f.fone),
        nome: cliente ? undefined : novo.nome.trim(),
        nascimento: novo.nasc || undefined,
        endereco: novo.end || undefined,
        servicoId: svc.id,
        profissionalId: prof.id,
        data: f.data,
        hora: f.hora,
        formaPagamento: f.pagamento,
      });
      const nomeCliente = cliente?.nome || novo.nome;
      const tpl = dados.templates.find(t => t.chave === 'confirmacao');
      const msg = renderTemplate(tpl.texto, {
        cliente: nomeCliente.split(' ')[0], estudio: config.nome, data: fmtData(f.data), hora: f.hora,
        servico: svc.nome, profissional: prof.nome.split(' ')[0], valor: brl(svc.preco), endereco: config.endereco,
      });
      setFeito({ nome: nomeCliente, msg, fone: soDigitos(f.fone) });
    } catch (e) {
      // O caso comum: alguém pegou o horário nos últimos segundos.
      setErroEnvio(e.message);
      setPasso(3);
    }
    setEnviando(false);
  };

  if (feito) return (
    <div className="flow">
      <div style={{ textAlign: 'center', padding: '20px 0 26px' }}>
        <div style={{ width: 62, height: 62, borderRadius: '50%', background: 'var(--ok)', display: 'grid', placeItems: 'center', margin: '0 auto 18px' }}>
          <Check size={30} color="#fff" strokeWidth={3} />
        </div>
        <h2 style={{ fontSize: 30 }}>Horário reservado</h2>
        <p style={{ color: 'var(--muted)', fontSize: 15, marginTop: 8 }}>
          {fmtData(f.data)} às {f.hora} · {svc.nome} com {prof.nome.split(' ')[0]}
        </p>
      </div>
      <div className="card" style={{ padding: 18 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Mensagem enviada no WhatsApp</div>
        <div className="bubble" style={{ background: '#F4F0F1' }}>{feito.msg}</div>
        <a className="btn btn-wa" style={{ width: '100%', marginTop: 14 }} href={waLink(feito.fone, feito.msg)} target="_blank" rel="noopener noreferrer">
          <MessageCircle size={17} /> Abrir no WhatsApp
        </a>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
          No sistema real esse envio é automático via API oficial do WhatsApp. Aqui o botão abre a conversa pra você ver o resultado.
        </p>
      </div>
      <button className="btn btn-g" style={{ width: '100%', marginTop: 12 }} onClick={sair}>Voltar ao início</button>
    </div>
  );

  const podeAvancar = { 1: !!f.servico, 2: !!f.prof, 3: !!f.hora, 4: cliente ? true : (novo.nome.trim().length > 2 && soDigitos(f.fone).length >= 10), 5: !!f.pagamento }[passo];

  return (
    <div className="flow">
      <div className="steps">{[1, 2, 3, 4, 5].map(n => <div key={n} className={'step-bar' + (n <= passo ? ' on' : '')} />)}</div>
      <button className="btn btn-g btn-s" style={{ marginBottom: 20 }} onClick={() => passo === 1 ? sair() : setPasso(passo - 1)}>
        <ArrowLeft size={15} /> Voltar
      </button>

      {passo === 1 && (<>
        <div className="eyebrow">Passo 1 de 5</div>
        <h2 style={{ fontSize: 28, margin: '6px 0 20px' }}>O que você quer fazer?</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {servicos.filter(s => s.ativo).map(s => (
            <button key={s.id} className="card" style={{ padding: 15, display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', borderColor: f.servico === s.id ? 'var(--lacquer)' : 'var(--line)' }}
              onClick={() => setF(v => ({ ...v, servico: s.id, prof: null, hora: null }))}>
              <span className="dot" style={{ background: CAT_COR[s.cat], marginTop: 0 }} />
              <span style={{ flex: 1 }}>
                <b style={{ fontSize: 15 }}>{s.nome}</b>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>{s.duracao} min</span>
              </span>
              <span className="mono" style={{ fontWeight: 600 }}>{brl(s.preco)}</span>
            </button>
          ))}
        </div>
      </>)}

      {passo === 2 && (<>
        <div className="eyebrow">Passo 2 de 5</div>
        <h2 style={{ fontSize: 28, margin: '6px 0 20px' }}>Com quem?</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {profs.map(p => (
            <button key={p.id} className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', borderColor: f.prof === p.id ? 'var(--lacquer)' : 'var(--line)' }}
              onClick={() => setF(v => ({ ...v, prof: p.id, hora: null }))}>
              <div className="avatar" style={{ background: p.cor }}>{iniciais(p.nome)}</div>
              <div><b style={{ fontSize: 15 }}>{p.nome}</b><div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.funcao}</div></div>
              {f.prof === p.id && <Check size={19} style={{ marginLeft: 'auto', color: 'var(--lacquer)' }} />}
            </button>
          ))}
        </div>
      </>)}

      {passo === 3 && (<>
        <div className="eyebrow">Passo 3 de 5</div>
        <h2 style={{ fontSize: 28, margin: '6px 0 20px' }}>Quando fica bom?</h2>
        <div className="days">
          {dias.map(d => {
            const temJornada = !!prof.jornada[dow(d)];
            const dt = new Date(d + 'T12:00:00');
            return (
              <button key={d} disabled={!temJornada} className={'day' + (f.data === d ? ' on' : '') + (!temJornada ? ' off' : '')}
                onClick={() => setF(v => ({ ...v, data: d, hora: null }))}>
                <div className="dw">{DIAS[dt.getDay()]}</div>
                <div className="dn">{dt.getDate()}</div>
                <div className="dw" style={{ opacity: .6 }}>{MESES[dt.getMonth()]}</div>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 24 }}>
          <label>Horários livres em {fmtData(f.data)}</label>
          {erroEnvio && (
            <div className="card" style={{ padding: 13, marginBottom: 10, fontSize: 13, borderColor: '#C08', color: '#8A2B2B' }}>
              {erroEnvio} Escolha outro horário.
            </div>
          )}
          {carregandoSlots
            ? <div className="card" style={{ padding: 18, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Consultando a agenda…</div>
            : slots.length === 0
            ? <div className="card" style={{ padding: 18, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
                Nenhum horário livre nesse dia. Escolha outra data acima.
              </div>
            : <div className="chips">
                {slots.map(h => <button key={h} className={'chip slot' + (f.hora === h ? ' on' : '')} onClick={() => setF(v => ({ ...v, hora: h }))}>{h}</button>)}
              </div>}
        </div>
      </>)}

      {passo === 4 && (<>
        <div className="eyebrow">Passo 4 de 5</div>
        <h2 style={{ fontSize: 28, margin: '6px 0 8px' }}>Seu WhatsApp</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>É por ele que a gente confirma e lembra do seu horário.</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <input inputMode="numeric" placeholder="(47) 99999-9999" value={fmtFone(f.fone)}
            onChange={e => { setF(v => ({ ...v, fone: soDigitos(e.target.value) })); setBuscou(false); setCliente(null); }} />
          <button className="btn btn-d" onClick={buscar} disabled={soDigitos(f.fone).length < 10 || buscando}>
            {buscando ? '…' : 'Continuar'}
          </button>
        </div>

        {buscou && cliente && (
          <div className="card" style={{ padding: 16, display: 'flex', gap: 12, alignItems: 'center', borderColor: 'var(--ok)' }}>
            <div className="avatar" style={{ background: 'var(--ok)' }}>{iniciais(cliente.nome)}</div>
            <div>
              <b style={{ fontSize: 15 }}>Oi de novo, {cliente.nome.split(' ')[0]}!</b>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Já temos seu cadastro. Não precisa preencher nada.</div>
            </div>
          </div>
        )}

        {buscou && !cliente && (
          <div className="card" style={{ padding: 18 }}>
            <div className="tag" style={{ marginBottom: 14 }}>Primeiro acesso</div>
            <Campo label="Nome completo"><input value={novo.nome} onChange={e => setNovo(v => ({ ...v, nome: e.target.value }))} placeholder="Como podemos te chamar" /></Campo>
            <Campo label="Data de nascimento"><input type="date" value={novo.nasc} onChange={e => setNovo(v => ({ ...v, nasc: e.target.value }))} /></Campo>
            <Campo label="Endereço"><input value={novo.end} onChange={e => setNovo(v => ({ ...v, end: e.target.value }))} placeholder="Rua, número e bairro" /></Campo>
            <p style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5, margin: 0 }}>
              Pedimos isso uma única vez. Nas próximas visitas basta o WhatsApp. Seus dados ficam só com a gente e servem para lembretes e mimos de aniversário.
            </p>
          </div>
        )}
      </>)}

      {passo === 5 && (<>
        <div className="eyebrow">Passo 5 de 5</div>
        <h2 style={{ fontSize: 28, margin: '6px 0 20px' }}>Confira e finalize</h2>
        <div className="resume" style={{ marginBottom: 18 }}>
          <div className="row"><span className="k">Serviço</span><span>{svc.nome}</span></div>
          <div className="row"><span className="k">Profissional</span><span>{prof.nome}</span></div>
          <div className="row"><span className="k">Quando</span><span className="mono">{fmtDataLonga(f.data)} · {f.hora}</span></div>
          <div className="row"><span className="k">Duração</span><span>{svc.duracao} min</span></div>
          <div className="row"><span className="k">Total</span><b className="mono" style={{ fontSize: 17 }}>{brl(svc.preco)}</b></div>
        </div>
        <label>Como quer pagar?</label>
        <div className="pay">
          <button className={'payopt' + (f.pagamento === 'pix' ? ' on' : '')} onClick={() => setF(v => ({ ...v, pagamento: 'pix' }))}>
            <QrCode size={22} color="var(--lacquer)" />
            <div><b>Pix agora</b><span>Garante o horário na hora. Chave: {config.pixChave}</span></div>
          </button>
          <button className={'payopt' + (f.pagamento === 'cartao' ? ' on' : '')} onClick={() => setF(v => ({ ...v, pagamento: 'cartao' }))}>
            <CreditCard size={22} color="var(--lacquer)" />
            <div><b>Cartão agora</b><span>Em até 3x sem juros pelo link de pagamento</span></div>
          </button>
          <button className={'payopt' + (f.pagamento === 'local' ? ' on' : '')} onClick={() => setF(v => ({ ...v, pagamento: 'local' }))}>
            <Banknote size={22} color="var(--lacquer)" />
            <div><b>Pagar no atendimento</b><span>Pix, cartão ou dinheiro no dia</span></div>
          </button>
        </div>
      </>)}

      {passo < 5 && (
        <button className="btn btn-p" style={{ width: '100%', marginTop: 24 }} disabled={!podeAvancar} onClick={() => setPasso(passo + 1)}>
          Continuar <ArrowRight size={17} />
        </button>
      )}
      {passo === 5 && (
        <button className="btn btn-p" style={{ width: '100%', marginTop: 24 }} disabled={!f.pagamento || enviando} onClick={confirmar}>
          {enviando ? 'Reservando…' : 'Confirmar agendamento'}
        </button>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════
   PAINEL
   ══════════════════════════════════════════════ */
function Painel({ dados, acao, recarregar, irSite, aviso }) {
  const [aba, setAba] = useState('agenda');
  const [fila, setFila] = useState({ modoManual: true, itens: [] });

  // A fila é calculada pelo servidor (jobs/mensagens.js). Aqui a gente só lê.
  const carregarFila = useCallback(async () => {
    try { await api.gerarFila(); setFila(await api.fila()); } catch { /* servidor fora */ }
  }, []);
  useEffect(() => { carregarFila(); }, [carregarFila]);

  const abas = [
    { k: 'agenda', nome: 'Agenda', icon: Calendar },
    { k: 'clientes', nome: 'Clientes', icon: Users },
    { k: 'servicos', nome: 'Serviços', icon: Sparkles },
    { k: 'equipe', nome: 'Equipe', icon: Store },
    { k: 'crm', nome: 'WhatsApp', icon: MessageCircle, badge: fila.itens.length },
    { k: 'financeiro', nome: 'Financeiro', icon: Wallet },
  ];

  return (
    <div className="shell">
      <nav className="rail">
        <div className="brand">
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--lacquer)', display: 'grid', placeItems: 'center' }}><Sparkles size={16} color="#fff" /></div>
          <div className="nm">{dados.config.nome}</div>
        </div>
        {abas.map(a => (
          <button key={a.k} className={'nav' + (aba === a.k ? ' on' : '')} onClick={() => setAba(a.k)}>
            <a.icon size={17} /> {a.nome}
            {a.badge > 0 && <span className="badge">{a.badge}</span>}
          </button>
        ))}
        <button className="nav" style={{ marginTop: 'auto' }} onClick={irSite}><ExternalLink size={17} /> Ver o site</button>
      </nav>
      <div className="main">
        {aba === 'agenda' && <Agenda dados={dados} acao={acao} aviso={aviso} />}
        {aba === 'clientes' && <Clientes dados={dados} acao={acao} aviso={aviso} />}
        {aba === 'servicos' && <Servicos dados={dados} acao={acao} aviso={aviso} />}
        {aba === 'equipe' && <Equipe dados={dados} acao={acao} aviso={aviso} />}
        {aba === 'crm' && <CRM dados={dados} acao={acao} aviso={aviso} fila={fila} recarregarFila={carregarFila} />}
        {aba === 'financeiro' && <Financeiro dados={dados} />}
      </div>
    </div>
  );
}

/* ── Agenda ── */
const H_INI = 8, H_FIM = 20, PX_H = 56;

function Agenda({ dados, acao, aviso }) {
  const { staff, servicos, clientes, agendamentos } = dados;
  const [data, setData] = useState(hojeISO());
  const [sel, setSel] = useState(null);
  const [novo, setNovo] = useState(false);

  const doDia = agendamentos.filter(a => a.data === data && a.status !== 'cancelado');
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
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 18 }}>
              {s?.nome} · {sel.duracao} min · com {p?.nome} · <b className="mono">{brl(sel.valor)}</b>
            </p>
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
    </>
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
        <button className="btn btn-p btn-s" onClick={() => setEdit({ nome: '', cat: 'Unhas', desc: '', preco: 0, duracao: 60, ativo: true, profs: [] })}><Plus size={16} /> Novo serviço</button>
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
      {edit && <EditarServico s={edit} staff={staff} acao={acao} fechar={() => setEdit(null)} aviso={aviso} />}
    </>
  );
}

function EditarServico({ s, staff, acao, fechar, aviso }) {
  const [f, setF] = useState({ ...s });
  const toggleProf = id => setF(v => ({ ...v, profs: v.profs.includes(id) ? v.profs.filter(x => x !== id) : [...v.profs, id] }));
  const salvar = async () => {
    const ok = await acao(() => api.salvarServico(f), 'Serviço salvo');
    if (ok) fechar();
  };
  return (
    <Modal onClose={fechar}>
      <h2 style={{ fontSize: 24, marginBottom: 18 }}>{s.id ? 'Editar serviço' : 'Novo serviço'}</h2>
      <Campo label="Nome"><input value={f.nome} onChange={e => setF(v => ({ ...v, nome: e.target.value }))} /></Campo>
      <Campo label="Descrição (aparece no site)"><textarea rows={2} value={f.desc} onChange={e => setF(v => ({ ...v, desc: e.target.value }))} /></Campo>
      <div className="mrow">
        <Campo label="Categoria">
          <select value={f.cat} onChange={e => setF(v => ({ ...v, cat: e.target.value }))}>
            {Object.keys(CAT_COR).map(c => <option key={c}>{c}</option>)}
          </select>
        </Campo>
        <Campo label="Preço (R$)"><input type="number" value={f.preco} onChange={e => setF(v => ({ ...v, preco: +e.target.value }))} /></Campo>
      </div>
      <Campo label="Duração (minutos)"><input type="number" step={15} value={f.duracao} onChange={e => setF(v => ({ ...v, duracao: +e.target.value }))} /></Campo>
      <Campo label="Quem executa">
        <div className="chips">
          {staff.map(p => <button key={p.id} className={'chip' + (f.profs.includes(p.id) ? ' on' : '')} onClick={() => toggleProf(p.id)}>{p.nome.split(' ')[0]}</button>)}
        </div>
      </Campo>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <Switch on={f.ativo} onChange={() => setF(v => ({ ...v, ativo: !v.ativo }))} />
        <span style={{ fontSize: 14 }}>Visível no site</span>
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
