import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Calendar, Check, Clock, Instagram, MapPin, MessageCircle,
  Phone, TriangleAlert,
} from 'lucide-react';
import * as api from '../shared/publico.js';
import { aplicarTema } from './tema.js';

/* ── datas: sempre texto, nunca Date com fuso (ver ARQUITETURA.md) ── */
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const somarDias = (iso, n) => {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(a, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};
const partes = iso => {
  const [a, m, d] = iso.split('-').map(Number);
  return { dia: d, mes: MESES[m - 1], semana: SEMANA[new Date(a, m - 1, d).getDay()] };
};
const porExtenso = iso => {
  const p = partes(iso);
  return `${p.semana}, ${p.dia} de ${p.mes}`;
};
const brl = v => (v == null ? '' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const duracaoTexto = min => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}` : `${min}min`);
const soDigitos = t => (t || '').replace(/\D/g, '');
const mascaraFone = t => {
  const d = soDigitos(t).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

export default function App() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [tela, setTela] = useState('home');
  const [servicoId, setServicoId] = useState(null);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    api.vitrine()
      .then(d => { setDados(d); aplicarTema(d.marca); document.title = d.negocio.nome; })
      .catch(e => setErro(e.message));
  }, []);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3600);
    return () => clearTimeout(t);
  }, [aviso]);

  const abrirFluxo = id => { setServicoId(id); setTela('fluxo'); window.scrollTo(0, 0); };
  const voltar = () => { setTela('home'); setServicoId(null); window.scrollTo(0, 0); };

  if (erro) return (
    <div className="centro">
      <div>
        <TriangleAlert size={32} color="var(--marca)" />
        <h2 style={{ margin: '14px 0 8px', fontSize: 20 }}>Não consegui carregar</h2>
        <p style={{ color: 'var(--cinza)', fontSize: 14.5, maxWidth: 340 }}>
          Tente recarregar a página em instantes.
        </p>
      </div>
    </div>
  );

  if (!dados) return <div className="centro"><p style={{ color: 'var(--fraco)' }}>Carregando…</p></div>;

  return (
    <>
      <Topo negocio={dados.negocio} marca={dados.marca} noFluxo={tela === 'fluxo'} aoVoltar={voltar} />
      {tela === 'home'
        ? <Home dados={dados} aoAgendar={abrirFluxo} />
        : <Fluxo dados={dados} servicoInicial={servicoId} aoSair={voltar} aviso={setAviso} />}
      {aviso && (
        <div className={'aviso' + (aviso.tipo === 'erro' ? ' erro' : '')} role="status">
          {aviso.tipo === 'erro' ? <TriangleAlert size={17} /> : <Check size={17} />}
          {aviso.texto}
        </div>
      )}
    </>
  );
}

/* ══════════════════════════════════════════════ */

function Topo({ negocio, marca, noFluxo, aoVoltar }) {
  return (
    <header className="topo">
      <div className="env topo-in">
        {noFluxo ? (
          <button className="b b-c b-peq" onClick={aoVoltar}><ArrowLeft size={16} /> Voltar</button>
        ) : (
          <div className="topo-marca">
            <Logo marca={marca} nome={negocio.nome} tamanho={30} />
            <span className="topo-nome">{negocio.nome}</span>
          </div>
        )}
        {negocio.whatsapp && !noFluxo && (
          <a
            className="b b-c b-peq"
            href={`https://wa.me/55${soDigitos(negocio.whatsapp)}`}
            target="_blank" rel="noreferrer"
          >
            <MessageCircle size={16} /> Falar
          </a>
        )}
      </div>
    </header>
  );
}

function Logo({ marca, nome, tamanho }) {
  const estilo = tamanho ? { width: tamanho, height: tamanho, borderWidth: 2 } : undefined;
  return (
    <div className="logo" style={estilo}>
      {marca?.logo
        ? <img src={marca.logo} alt="" />
        : <span className="logo-letra" style={tamanho ? { fontSize: tamanho * 0.5 } : undefined}>
            {(nome || '?').trim()[0]?.toUpperCase()}
          </span>}
    </div>
  );
}

/* ── home ── */

function Home({ dados, aoAgendar }) {
  const { negocio, marca, textos, exibir, servicos } = dados;
  const categorias = useMemo(() => {
    if (!exibir?.categorias) return [{ nome: null, itens: servicos }];
    const mapa = new Map();
    for (const s of servicos) {
      const c = s.categoria || 'Serviços';
      if (!mapa.has(c)) mapa.set(c, []);
      mapa.get(c).push(s);
    }
    return [...mapa].map(([nome, itens]) => ({ nome, itens }));
  }, [servicos, exibir]);

  return (
    <main>
      <div className="capa">
        {marca?.capa ? <img src={marca.capa} alt="" /> : <div className="capa-vazia" />}
      </div>

      <div className="env identidade">
        <Logo marca={marca} nome={negocio.nome} />
        <h1>{negocio.nome}</h1>
        {negocio.slogan && <p className="slogan">{negocio.slogan}</p>}
        {negocio.endereco && (
          <a
            className="local"
            href={negocio.mapa || `https://maps.google.com/?q=${encodeURIComponent(negocio.endereco)}`}
            target="_blank" rel="noreferrer"
          >
            <MapPin size={15} /> {negocio.endereco}
          </a>
        )}
        <div className="chamada">
          {/* Sem serviço definido: a chamada geral leva à escolha, não ao
              primeiro da lista. Quem já sabe o que quer usa o botão do próprio
              serviço, mais abaixo. */}
          <button className="b b-p b-larg" onClick={() => aoAgendar(null)}>
            <Calendar size={18} /> {textos?.chamada || 'Agende seu horário'}
          </button>
        </div>
      </div>

      <div className="env">
        {negocio.sobre && (
          <section className="sec">
            <p style={{ color: 'var(--cinza)', fontSize: 15 }}>{negocio.sobre}</p>
          </section>
        )}

        <section className="sec">
          <h2 className="sec-titulo">Serviços</h2>
          {servicos.length === 0 && <p className="vazio">Nenhum serviço disponível no momento.</p>}
          {categorias.map(({ nome, itens }) => (
            <div key={nome || 'todos'}>
              {nome && <h3 className="cat">{nome}</h3>}
              {itens.map(s => (
                <article key={s.id} className="svc">
                  {exibir?.fotos && s.foto && <img className="svc-foto" src={s.foto} alt="" />}
                  <div className="svc-txt">
                    <div className="svc-nome">{s.nome}</div>
                    {s.descricao && <div className="svc-desc">{s.descricao}</div>}
                    <div className="svc-meta">
                      {s.preco != null
                        ? <span className="svc-preco">{brl(s.preco)}</span>
                        : <span className="svc-preco" style={{ color: 'var(--cinza)' }}>Sob consulta</span>}
                      {exibir?.duracao && <span className="svc-dur">{duracaoTexto(s.duracao)}</span>}
                    </div>
                  </div>
                  <button className="b b-c b-peq" onClick={() => aoAgendar(s.id)}>
                    {textos?.botaoAgendar || 'Agendar'}
                  </button>
                </article>
              ))}
            </div>
          ))}
        </section>
      </div>

      <Rodape negocio={negocio} textos={textos} />
    </main>
  );
}

function Rodape({ negocio, textos }) {
  const NOMES_PAG = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' };
  return (
    <footer className="rodape">
      <div className="env">
        <h2 className="sec-titulo">Contato</h2>
        <div className="rodape-links">
          {negocio.endereco && (
            <a className="rodape-link"
               href={negocio.mapa || `https://maps.google.com/?q=${encodeURIComponent(negocio.endereco)}`}
               target="_blank" rel="noreferrer">
              <MapPin size={17} /> {negocio.endereco}
            </a>
          )}
          {negocio.whatsapp && (
            <a className="rodape-link" href={`https://wa.me/55${soDigitos(negocio.whatsapp)}`}
               target="_blank" rel="noreferrer">
              <MessageCircle size={17} /> WhatsApp
            </a>
          )}
          {negocio.fone && negocio.fone !== negocio.whatsapp && (
            <a className="rodape-link" href={`tel:${soDigitos(negocio.fone)}`}>
              <Phone size={17} /> {negocio.fone}
            </a>
          )}
          {negocio.instagram && (
            <a className="rodape-link"
               href={`https://instagram.com/${negocio.instagram.replace('@', '')}`}
               target="_blank" rel="noreferrer">
              <Instagram size={17} /> @{negocio.instagram.replace('@', '')}
            </a>
          )}
        </div>

        {negocio.formasPagamento?.length > 0 && (
          <div className="pagamentos">
            {negocio.formasPagamento.map(f => <span key={f} className="pag">{NOMES_PAG[f] || f}</span>)}
          </div>
        )}

        <p className="assinatura">{textos?.rodape || negocio.nome}</p>
      </div>
    </footer>
  );
}

/* ── agendamento em passos ── */

const PASSOS = ['servico', 'profissional', 'horario', 'dados', 'pronto'];

function Fluxo({ dados, servicoInicial, aoSair, aviso }) {
  const { negocio, textos, exibir, servicos, profissionais } = dados;
  const [passo, setPasso] = useState(servicoInicial ? 'profissional' : 'servico');
  const [escolha, setEscolha] = useState({ servicoId: servicoInicial, profissionalId: null, data: hojeISO(), hora: null });
  const [confirmado, setConfirmado] = useState(null);

  const servico = servicos.find(s => s.id === escolha.servicoId);
  const equipeDoServico = profissionais.filter(p => servico?.profissionais?.includes(p.id));
  const profissional = profissionais.find(p => p.id === escolha.profissionalId);

  // Uma profissional só, ou a empresa não quer que a cliente escolha: pula o passo.
  useEffect(() => {
    if (passo !== 'profissional' || !servico) return;
    if (!exibir?.escolherProfissional || equipeDoServico.length === 1) {
      setEscolha(e => ({ ...e, profissionalId: equipeDoServico[0]?.id || null }));
      setPasso('horario');
    }
  }, [passo, servico, equipeDoServico, exibir]);

  const indice = PASSOS.indexOf(passo);
  const voltarPasso = () => {
    if (indice <= 0) return aoSair();
    const anterior = PASSOS[indice - 1];
    // Não volta para um passo que foi pulado.
    if (anterior === 'profissional' && (!exibir?.escolherProfissional || equipeDoServico.length === 1)) {
      return setPasso('servico');
    }
    setPasso(anterior);
  };

  return (
    <main className="env" style={{ paddingBottom: 40 }}>
      <div className="passos" aria-hidden="true">
        {PASSOS.slice(0, 4).map((p, i) => (
          <div key={p} className={'passo' + (i <= indice ? ' feito' : '')} />
        ))}
      </div>

      {passo === 'servico' && (
        <PassoServico
          servicos={servicos} exibir={exibir}
          aoEscolher={id => { setEscolha(e => ({ ...e, servicoId: id })); setPasso('profissional'); }}
        />
      )}

      {passo === 'profissional' && (
        <PassoProfissional
          equipe={equipeDoServico}
          aoEscolher={id => { setEscolha(e => ({ ...e, profissionalId: id })); setPasso('horario'); }}
          aoVoltar={voltarPasso}
        />
      )}

      {passo === 'horario' && (
        <PassoHorario
          escolha={escolha} negocio={negocio}
          aoEscolher={(data, hora, profissionalId) => {
            setEscolha(e => ({ ...e, data, hora, profissionalId: profissionalId || e.profissionalId }));
            setPasso('dados');
          }}
          aoVoltar={voltarPasso}
          aviso={aviso}
        />
      )}

      {passo === 'dados' && (
        <PassoDados
          escolha={escolha} servico={servico} profissional={profissional}
          negocio={negocio} textos={textos}
          aoConfirmar={r => { setConfirmado(r); setPasso('pronto'); window.scrollTo(0, 0); }}
          aoVoltar={voltarPasso}
          aviso={aviso}
        />
      )}

      {passo === 'pronto' && (
        <PassoPronto
          resultado={confirmado} escolha={escolha} servico={servico}
          profissional={profissional} negocio={negocio} textos={textos} aoSair={aoSair}
        />
      )}
    </main>
  );
}

function PassoServico({ servicos, exibir, aoEscolher }) {
  return (
    <>
      <h2 style={{ fontSize: 21, marginBottom: 4 }}>O que você quer fazer?</h2>
      <p style={{ color: 'var(--cinza)', fontSize: 14.5, marginBottom: 20 }}>Escolha um serviço para continuar.</p>
      <div className="opcoes">
        {servicos.map(s => (
          <button key={s.id} className="opcao" onClick={() => aoEscolher(s.id)}>
            <div className="svc-txt">
              <div className="opcao-nome">{s.nome}</div>
              <div className="opcao-sub">
                {s.preco != null ? brl(s.preco) : 'Sob consulta'}
                {exibir?.duracao && ` · ${duracaoTexto(s.duracao)}`}
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function PassoProfissional({ equipe, aoEscolher, aoVoltar }) {
  if (!equipe.length) return (
    <>
      <h2 style={{ fontSize: 21, marginBottom: 8 }}>Ninguém disponível</h2>
      <p style={{ color: 'var(--cinza)', fontSize: 14.5, marginBottom: 20 }}>
        Este serviço ainda não tem profissional vinculado. Fale com o estabelecimento.
      </p>
      <button className="b b-c b-larg" onClick={aoVoltar}>Escolher outro serviço</button>
    </>
  );

  return (
    <>
      <h2 style={{ fontSize: 21, marginBottom: 4 }}>Com quem?</h2>
      <p style={{ color: 'var(--cinza)', fontSize: 14.5, marginBottom: 20 }}>Escolha quem vai te atender.</p>
      <div className="opcoes">
        {equipe.map(p => (
          <button key={p.id} className="opcao" onClick={() => aoEscolher(p.id)}>
            <span className="avatar" style={{ background: p.cor || 'var(--marca)' }}>
              {p.nome.trim()[0].toUpperCase()}
            </span>
            <div>
              <div className="opcao-nome">{p.nome}</div>
              {p.funcao && <div className="opcao-sub">{p.funcao}</div>}
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function PassoHorario({ escolha, negocio, aoEscolher, aoVoltar, aviso }) {
  const [data, setData] = useState(escolha.data);
  const [livres, setLivres] = useState(null);
  const [carregando, setCarregando] = useState(false);

  const dias = useMemo(
    () => Array.from({ length: Math.min(negocio.janelaDias || 30, 30) }, (_, i) => somarDias(hojeISO(), i)),
    [negocio.janelaDias]
  );

  const buscar = useCallback(async () => {
    setCarregando(true);
    try {
      // Quem decide o que está livre é o servidor — o front nunca adivinha.
      const r = await api.horarios({
        servicoId: escolha.servicoId,
        profissionalId: escolha.profissionalId || undefined,
        data,
      });
      setLivres(r.horarios ? r.horarios.map(h => ({ hora: h }))
        : (r.porProfissional || []).flatMap(p => p.horarios.map(h => ({ hora: h, profissionalId: p.profissionalId }))));
    } catch (e) {
      aviso({ tipo: 'erro', texto: e.message });
      setLivres([]);
    } finally {
      setCarregando(false);
    }
  }, [data, escolha.servicoId, escolha.profissionalId, aviso]);

  useEffect(() => { buscar(); }, [buscar]);

  // Sem profissional escolhido, o mesmo horário pode vir de várias pessoas.
  const horasUnicas = useMemo(() => {
    const vistas = new Map();
    for (const l of livres || []) if (!vistas.has(l.hora)) vistas.set(l.hora, l);
    return [...vistas.values()].sort((a, b) => a.hora.localeCompare(b.hora));
  }, [livres]);

  return (
    <>
      <h2 style={{ fontSize: 21, marginBottom: 4 }}>Quando?</h2>
      <p style={{ color: 'var(--cinza)', fontSize: 14.5, marginBottom: 16 }}>Escolha o dia e o horário.</p>

      <div className="dias">
        {dias.map(d => {
          const p = partes(d);
          return (
            <button key={d} className={'dia' + (d === data ? ' on' : '')} onClick={() => setData(d)}>
              <div className="sem">{p.semana}</div>
              <div className="num">{p.dia}</div>
              <div className="sem">{p.mes}</div>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 10 }}>
        {carregando && <p className="vazio">Buscando horários…</p>}
        {!carregando && horasUnicas.length === 0 && (
          <p className="vazio">Nenhum horário livre em {porExtenso(data)}. Tente outro dia.</p>
        )}
        {!carregando && horasUnicas.length > 0 && (
          <div className="horas">
            {horasUnicas.map(l => (
              <button key={l.hora} className="hora" onClick={() => aoEscolher(data, l.hora, l.profissionalId)}>
                {l.hora}
              </button>
            ))}
          </div>
        )}
      </div>

      <button className="b b-c b-larg" style={{ marginTop: 22 }} onClick={aoVoltar}>Voltar</button>
    </>
  );
}

function PassoDados({ escolha, servico, profissional, negocio, textos, aoConfirmar, aoVoltar, aviso }) {
  const [fone, setFone] = useState('');
  const [conhecida, setConhecida] = useState(null);   // null = ainda não checou
  const [form, setForm] = useState({ nome: '', nascimento: '', endereco: '', aceitaMensagens: true });
  const [formaPagamento, setFormaPagamento] = useState('local');
  const [ocupado, setOcupado] = useState(false);

  const digitos = soDigitos(fone);
  const foneValido = digitos.length >= 10;

  const checar = async () => {
    if (!foneValido) return;
    setOcupado(true);
    try {
      const r = await api.identificar(digitos);
      setConhecida(r);
    } catch (e) {
      aviso({ tipo: 'erro', texto: e.message });
    } finally {
      setOcupado(false);
    }
  };

  const confirmar = async () => {
    setOcupado(true);
    try {
      const r = await api.agendar({
        fone: digitos,
        servicoId: escolha.servicoId,
        profissionalId: escolha.profissionalId,
        data: escolha.data,
        hora: escolha.hora,
        formaPagamento,
        ...(conhecida?.cadastrada ? {} : form),
      });
      aoConfirmar(r);
    } catch (e) {
      aviso({ tipo: 'erro', texto: e.message });
      setOcupado(false);
    }
  };

  return (
    <>
      <h2 style={{ fontSize: 21, marginBottom: 16 }}>Confirmar</h2>

      <dl className="resumo">
        <div className="resumo-linha"><dt>Serviço</dt><dd>{servico?.nome}</dd></div>
        {profissional && <div className="resumo-linha"><dt>Com</dt><dd>{profissional.nome}</dd></div>}
        <div className="resumo-linha"><dt>Quando</dt><dd>{porExtenso(escolha.data)} · {escolha.hora}</dd></div>
        {servico?.preco != null && <div className="resumo-linha"><dt>Valor</dt><dd>{brl(servico.preco)}</dd></div>}
      </dl>

      <div className="campo">
        <label htmlFor="fone">Seu WhatsApp</label>
        <input
          id="fone" type="tel" inputMode="numeric" autoComplete="tel"
          placeholder="(47) 99999-9999" value={mascaraFone(fone)}
          onChange={e => { setFone(e.target.value); setConhecida(null); }}
          onBlur={checar}
        />
      </div>

      {conhecida === null && (
        <>
          <p className="ajuda">É por ele que você recebe a confirmação e o lembrete.</p>
          <button className="b b-p b-larg" disabled={!foneValido || ocupado} onClick={checar}>
            Continuar
          </button>
        </>
      )}

      {conhecida?.cadastrada && (
        <>
          <p className="ajuda">Oi de novo, {conhecida.primeiroNome}! Já temos seu cadastro.</p>
          <FormaPagamento negocio={negocio} valor={formaPagamento} aoMudar={setFormaPagamento} />
          <button className="b b-p b-larg" disabled={ocupado} onClick={confirmar}>
            {ocupado ? 'Confirmando…' : 'Confirmar horário'}
          </button>
        </>
      )}

      {conhecida && !conhecida.cadastrada && (
        <>
          <p className="ajuda">Primeira vez por aqui — só precisamos destes dados, uma vez só.</p>
          <div className="campo">
            <label htmlFor="nome">Nome completo</label>
            <input id="nome" autoComplete="name" value={form.nome}
                   onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
          </div>
          <div className="campo">
            <label htmlFor="nasc">Nascimento</label>
            <input id="nasc" type="date" value={form.nascimento}
                   onChange={e => setForm(f => ({ ...f, nascimento: e.target.value }))} />
          </div>
          <FormaPagamento negocio={negocio} valor={formaPagamento} aoMudar={setFormaPagamento} />
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, color: 'var(--cinza)', marginBottom: 18 }}>
            <input type="checkbox" style={{ width: 18, height: 18, marginTop: 2 }}
                   checked={form.aceitaMensagens}
                   onChange={e => setForm(f => ({ ...f, aceitaMensagens: e.target.checked }))} />
            Quero receber novidades e promoções no WhatsApp. Lembretes do meu horário eu recebo de qualquer forma.
          </label>
          <button className="b b-p b-larg"
                  disabled={ocupado || form.nome.trim().length < 3}
                  onClick={confirmar}>
            {ocupado ? 'Confirmando…' : 'Confirmar horário'}
          </button>
        </>
      )}

      <button className="b b-c b-larg" style={{ marginTop: 12 }} onClick={aoVoltar}>Voltar</button>
    </>
  );
}

function FormaPagamento({ negocio, valor, aoMudar }) {
  const formas = negocio.formasPagamento || [];
  if (!formas.length) return null;
  const NOMES = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' };
  return (
    <div className="campo">
      <label htmlFor="pag">Pagamento</label>
      <select id="pag" value={valor} onChange={e => aoMudar(e.target.value)}>
        <option value="local">Pago no atendimento</option>
        {formas.map(f => <option key={f} value={f}>{NOMES[f] || f}</option>)}
      </select>
    </div>
  );
}

function PassoPronto({ resultado, escolha, servico, profissional, negocio, textos, aoSair }) {
  return (
    <div style={{ textAlign: 'center', paddingTop: 20 }}>
      <div className="feito-marca"><Check size={32} /></div>
      <h2 style={{ fontSize: 22, marginBottom: 8 }}>
        {textos?.confirmacao || 'Pronto! Seu horário está reservado.'}
      </h2>
      <p style={{ color: 'var(--cinza)', fontSize: 14.5, marginBottom: 24 }}>
        {resultado?.cliente?.primeiroNome && `${resultado.cliente.primeiroNome}, `}
        você recebe a confirmação no WhatsApp.
      </p>

      <dl className="resumo" style={{ textAlign: 'left' }}>
        <div className="resumo-linha"><dt>Serviço</dt><dd>{servico?.nome}</dd></div>
        {profissional && <div className="resumo-linha"><dt>Com</dt><dd>{profissional.nome}</dd></div>}
        <div className="resumo-linha">
          <dt><Clock size={13} style={{ verticalAlign: -2 }} /> Quando</dt>
          <dd>{porExtenso(escolha.data)} · {escolha.hora}</dd>
        </div>
        {negocio.endereco && <div className="resumo-linha"><dt>Onde</dt><dd>{negocio.endereco}</dd></div>}
      </dl>

      <button className="b b-p b-larg" onClick={aoSair}>Voltar ao início</button>
    </div>
  );
}
