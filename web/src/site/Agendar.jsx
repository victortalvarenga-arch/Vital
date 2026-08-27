import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Clock, User, X } from 'lucide-react';
import * as api from '../shared/publico.js';
import { brl, duracaoTexto, hojeISO, mesDe, nomeDoMes, porExtenso, soDigitos, mascaraFone } from './datas.js';

/**
 * Agendamento em janela sobre a home.
 *
 * Três colunas: onde a pessoa está, o passo atual, e o resumo do que já
 * escolheu. O resumo não é enfeite — é ele que dá segurança para confirmar,
 * porque mostra serviço, profissional e total antes do botão final.
 *
 * No celular não cabem três colunas: vira uma, e o resumo desce para uma barra
 * no rodapé que mostra o total e abre ao toque.
 */

const PASSOS = [
  { k: 'servico', titulo: 'Escolha o serviço', ajuda: 'O que você quer fazer hoje.' },
  { k: 'profissional', titulo: 'Escolha quem atende', ajuda: 'Você pode deixar que a gente escolha por você.' },
  { k: 'data', titulo: 'Selecione a data e horário', ajuda: 'Dias marcados têm horário disponível.' },
  { k: 'dados', titulo: 'Seus dados', ajuda: 'Só o WhatsApp, para você receber a confirmação.' },
  { k: 'pronto', titulo: 'Tudo certo', ajuda: '' },
];

export default function Agendar({ dados, servicoInicial, aoFechar }) {
  const { negocio, textos, exibir, servicos, profissionais } = dados;
  const [passo, setPasso] = useState(servicoInicial ? 'profissional' : 'servico');
  const [escolha, setEscolha] = useState({
    servicoId: servicoInicial || null, profissionalId: null, data: null, hora: null,
  });
  const [confirmado, setConfirmado] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [resumoAberto, setResumoAberto] = useState(false);
  const janela = useRef(null);

  const servico = servicos.find(s => s.id === escolha.servicoId);
  const equipe = profissionais.filter(p => servico?.profissionais?.includes(p.id));
  const profissional = profissionais.find(p => p.id === escolha.profissionalId);
  const indice = PASSOS.findIndex(p => p.k === passo);
  const info = PASSOS[indice];

  // Esc fecha, e o foco fica preso dentro da janela: quem navega por teclado
  // não deve sair para a página atrás sem perceber.
  useEffect(() => {
    const aoTeclar = e => {
      if (e.key === 'Escape') return aoFechar();
      if (e.key !== 'Tab') return;
      const focaveis = janela.current?.querySelectorAll(
        'button:not([disabled]), input, select, a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focaveis?.length) return;
      const primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    };
    document.addEventListener('keydown', aoTeclar);
    // Trava a rolagem da página de trás enquanto a janela está aberta.
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', aoTeclar); document.body.style.overflow = antes; };
  }, [aoFechar]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3600);
    return () => clearTimeout(t);
  }, [aviso]);

  // Uma pessoa só, ou a empresa não quer que a cliente escolha: pula o passo.
  const pulaProfissional = !exibir?.escolherProfissional || equipe.length <= 1;
  useEffect(() => {
    if (passo !== 'profissional' || !servico) return;
    if (pulaProfissional) {
      setEscolha(e => ({ ...e, profissionalId: equipe.length === 1 ? equipe[0].id : null }));
      setPasso('data');
    }
  }, [passo, servico, pulaProfissional, equipe]);

  const voltar = () => {
    if (indice <= 0) return aoFechar();
    const anterior = PASSOS[indice - 1].k;
    if (anterior === 'profissional' && pulaProfissional) return setPasso('servico');
    setPasso(anterior);
  };

  const total = servico?.preco ?? null;

  return (
    <div className="jn-fundo" onMouseDown={e => e.target === e.currentTarget && aoFechar()}>
      <div className="jn" ref={janela} role="dialog" aria-modal="true" aria-label={info.titulo}>

        {/* coluna 1 — onde estou */}
        <aside className="jn-guia">
          <div className="jn-bolinhas" aria-hidden="true">
            {PASSOS.map((p, i) => <span key={p.k} className={'bolinha' + (i <= indice ? ' on' : '')} />)}
          </div>
          <div className="jn-guia-meio">
            <div className="jn-guia-icone"><Clock size={30} strokeWidth={1.4} /></div>
            <h3>{info.titulo}</h3>
            {info.ajuda && <p>{info.ajuda}</p>}
          </div>
          {negocio.whatsapp && (
            <a className="jn-duvida" href={`https://wa.me/55${soDigitos(negocio.whatsapp)}`}
               target="_blank" rel="noreferrer">
              Dúvidas?<br />Fale conosco!
            </a>
          )}
        </aside>

        {/* coluna 2 — o passo */}
        <section className="jn-centro">
          <header className="jn-cab">
            <h2>{info.titulo}</h2>
            <button className="jn-x" onClick={aoFechar} aria-label="Fechar"><X size={20} /></button>
          </header>

          <div className="jn-corpo">
            {passo === 'servico' && (
              <Opcoes
                itens={servicos.map(s => ({
                  id: s.id, nome: s.nome, foto: s.foto,
                  sub: [s.preco != null ? brl(s.preco) : 'Sob consulta',
                        exibir?.duracao ? duracaoTexto(s.duracao) : null].filter(Boolean).join(' · '),
                }))}
                aoEscolher={id => { setEscolha(e => ({ ...e, servicoId: id, profissionalId: null, data: null, hora: null })); setPasso('profissional'); }}
              />
            )}

            {passo === 'profissional' && (
              <Opcoes
                itens={[
                  { id: null, nome: 'Qualquer profissional', sub: 'A gente escolhe quem estiver livre', icone: true },
                  ...equipe.map(p => ({ id: p.id, nome: p.nome, sub: p.funcao, cor: p.cor })),
                ]}
                aoEscolher={id => { setEscolha(e => ({ ...e, profissionalId: id, data: null, hora: null })); setPasso('data'); }}
              />
            )}

            {passo === 'data' && (
              <PassoData
                escolha={escolha} negocio={negocio} aviso={setAviso}
                aoEscolher={(data, hora, profId) => {
                  setEscolha(e => ({ ...e, data, hora, profissionalId: profId ?? e.profissionalId }));
                  setPasso('dados');
                }}
              />
            )}

            {passo === 'dados' && (
              <PassoDados
                escolha={escolha} negocio={negocio} aviso={setAviso}
                aoConfirmar={r => { setConfirmado(r); setPasso('pronto'); }}
              />
            )}

            {passo === 'pronto' && (
              <Pronto resultado={confirmado} escolha={escolha} servico={servico}
                      profissional={profissional} negocio={negocio} textos={textos}
                      aoFechar={aoFechar} />
            )}
          </div>

          {passo !== 'pronto' && (
            <footer className="jn-pe">
              <button className="jn-voltar" onClick={voltar}>
                <ArrowLeft size={16} /> Voltar
              </button>
            </footer>
          )}
        </section>

        {/* coluna 3 — o que já foi escolhido */}
        <Resumo
          servico={servico} profissional={profissional} escolha={escolha} total={total}
          aberto={resumoAberto} aoAlternar={() => setResumoAberto(v => !v)}
        />

        {aviso && <div className="jn-aviso">{aviso}</div>}
      </div>
    </div>
  );
}

/* ── resumo ── */

function Resumo({ servico, profissional, escolha, total, aberto, aoAlternar }) {
  const vazio = !servico && !profissional && !escolha.data;
  return (
    <aside className={'jn-resumo' + (aberto ? ' aberto' : '')}>
      {/* No celular esta barra é o que fica visível; o resto abre ao toque. */}
      <button className="jn-resumo-barra" onClick={aoAlternar} aria-expanded={aberto}>
        <span className="jn-resumo-titulo">Resumo</span>
        {total != null && <span className="jn-resumo-total">{brl(total)}</span>}
        <ChevronRight size={16} className="jn-resumo-seta" />
      </button>

      <div className="jn-resumo-corpo">
        {vazio && <p className="jn-resumo-vazio">Suas escolhas aparecem aqui.</p>}

        {profissional && <ItemResumo rotulo="Profissional" valor={profissional.nome} />}
        {!profissional && escolha.data && <ItemResumo rotulo="Profissional" valor="Qualquer um" />}
        {servico && <ItemResumo rotulo="Serviço" valor={servico.nome} />}
        {escolha.data && (
          <ItemResumo rotulo="Data e horário" valor={`${porExtenso(escolha.data)}${escolha.hora ? ` · ${escolha.hora}` : ''}`} />
        )}

        {/* Serviços adicionais entram aqui no Bloco 6c. */}

        {total != null && (
          <div className="jn-resumo-fim">
            <span>Total</span>
            <strong>{brl(total)}</strong>
          </div>
        )}
      </div>
    </aside>
  );
}

const ItemResumo = ({ rotulo, valor }) => (
  <div className="jn-item">
    <dt>{rotulo}</dt>
    <dd>{valor}</dd>
  </div>
);

/* ── passos ── */

function Opcoes({ itens, aoEscolher }) {
  if (!itens.length) return <p className="jn-vazio">Nada disponível por aqui.</p>;
  return (
    <div className="jn-opcoes">
      {itens.map(o => (
        <button key={o.id ?? 'qualquer'} className="jn-opcao" onClick={() => aoEscolher(o.id)}>
          {o.foto
            ? <img className="jn-opcao-foto" src={o.foto} alt="" />
            : <span className="jn-opcao-marca" style={o.cor ? { background: o.cor } : undefined}>
                {o.icone ? <User size={18} /> : o.nome.trim()[0].toUpperCase()}
              </span>}
          <span className="jn-opcao-txt">
            <span className="jn-opcao-nome">{o.nome}</span>
            {o.sub && <span className="jn-opcao-sub">{o.sub}</span>}
          </span>
          <ChevronRight size={18} className="jn-opcao-seta" />
        </button>
      ))}
    </div>
  );
}

function PassoData({ escolha, negocio, aoEscolher, aviso }) {
  const [mes, setMes] = useState(mesDe(hojeISO()));
  const [comVaga, setComVaga] = useState(null);
  const [dia, setDia] = useState(null);
  const [horas, setHoras] = useState(null);

  const carregarMes = useCallback(async () => {
    setComVaga(null);
    try {
      const r = await api.diasLivres({
        servicoId: escolha.servicoId,
        profissionalId: escolha.profissionalId || undefined,
        mes,
      });
      setComVaga(new Set(r.dias));
    } catch (e) { aviso(e.message); setComVaga(new Set()); }
  }, [mes, escolha.servicoId, escolha.profissionalId, aviso]);

  useEffect(() => { carregarMes(); }, [carregarMes]);

  const abrirDia = async d => {
    setDia(d); setHoras(null);
    try {
      const r = await api.horarios({
        servicoId: escolha.servicoId,
        profissionalId: escolha.profissionalId || undefined,
        data: d,
      });
      setHoras(r.horarios
        ? r.horarios.map(h => ({ hora: h }))
        : (r.porProfissional || []).flatMap(p => p.horarios.map(h => ({ hora: h, profissionalId: p.profissionalId }))));
    } catch (e) { aviso(e.message); setHoras([]); }
  };

  // Sem profissional escolhido, o mesmo horário pode vir de várias pessoas.
  const horasUnicas = useMemo(() => {
    const vistas = new Map();
    for (const h of horas || []) if (!vistas.has(h.hora)) vistas.set(h.hora, h);
    return [...vistas.values()].sort((a, b) => a.hora.localeCompare(b.hora));
  }, [horas]);

  const grade = useMemo(() => montarMes(mes), [mes]);
  const mesMinimo = mesDe(hojeISO());

  return (
    <>
      <div className="cal-topo">
        <button className="cal-nav" disabled={mes <= mesMinimo}
                onClick={() => setMes(somarMes(mes, -1))}>
          <ChevronLeft size={16} /> <span>Mês anterior</span>
        </button>
        <strong className="cal-mes">{nomeDoMes(mes)}</strong>
        <button className="cal-nav" onClick={() => setMes(somarMes(mes, 1))}>
          <span>Próximo mês</span> <ChevronRight size={16} />
        </button>
      </div>

      <div className="cal">
        {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map(d => (
          <span key={d} className="cal-cab">{d}</span>
        ))}
        {grade.map(({ iso, numero, doMes }, i) => {
          const livre = comVaga?.has(iso);
          return (
            <button
              key={i}
              className={'cal-dia' + (doMes ? '' : ' fora') + (livre ? ' livre' : '') + (iso === dia ? ' on' : '')}
              disabled={!livre}
              onClick={() => abrirDia(iso)}
              aria-label={livre ? `${porExtenso(iso)} — tem horário` : `${porExtenso(iso)} — sem horário`}
            >
              {numero}
            </button>
          );
        })}
      </div>
      {comVaga === null && <p className="jn-vazio">Consultando a agenda…</p>}

      {dia && (
        <div className="cal-horas">
          <h4>{porExtenso(dia)}</h4>
          {horas === null && <p className="jn-vazio">Buscando horários…</p>}
          {horas?.length === 0 && <p className="jn-vazio">Sem horário livre neste dia.</p>}
          {horasUnicas.length > 0 && (
            <div className="horas">
              {horasUnicas.map(h => (
                <button key={h.hora} className="hora"
                        onClick={() => aoEscolher(dia, h.hora, h.profissionalId)}>
                  {h.hora}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function PassoDados({ escolha, negocio, aoConfirmar, aviso }) {
  const [fone, setFone] = useState('');
  const [conhecida, setConhecida] = useState(null);
  const [form, setForm] = useState({ nome: '', nascimento: '', aceitaMensagens: true });
  const [formaPagamento, setFormaPagamento] = useState('local');
  const [ocupado, setOcupado] = useState(false);

  const digitos = soDigitos(fone);
  const valido = digitos.length >= 10;

  const checar = async () => {
    if (!valido) return;
    setOcupado(true);
    try { setConhecida(await api.identificar(digitos)); }
    catch (e) { aviso(e.message); }
    finally { setOcupado(false); }
  };

  const confirmar = async () => {
    setOcupado(true);
    try {
      aoConfirmar(await api.agendar({
        fone: digitos,
        servicoId: escolha.servicoId,
        profissionalId: escolha.profissionalId,
        data: escolha.data,
        hora: escolha.hora,
        formaPagamento,
        ...(conhecida?.cadastrada ? {} : form),
      }));
    } catch (e) { aviso(e.message); setOcupado(false); }
  };

  const formas = negocio.formasPagamento || [];
  const NOMES = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' };

  return (
    <div className="jn-form">
      <div className="campo">
        <label htmlFor="jn-fone">Seu WhatsApp</label>
        <input id="jn-fone" type="tel" inputMode="numeric" autoComplete="tel"
               placeholder="(47) 99999-9999" value={mascaraFone(fone)}
               onChange={e => { setFone(e.target.value); setConhecida(null); }}
               onBlur={checar} />
      </div>

      {conhecida === null && (
        <>
          <p className="ajuda">É por ele que você recebe a confirmação e o lembrete.</p>
          <button className="b b-p b-larg" disabled={!valido || ocupado} onClick={checar}>Continuar</button>
        </>
      )}

      {conhecida?.cadastrada && (
        <p className="ajuda">Oi de novo, {conhecida.primeiroNome}! Já temos seu cadastro.</p>
      )}

      {conhecida && !conhecida.cadastrada && (
        <>
          <p className="ajuda">Primeira vez por aqui — só precisamos destes dados, uma vez só.</p>
          <div className="campo">
            <label htmlFor="jn-nome">Nome completo</label>
            <input id="jn-nome" autoComplete="name" value={form.nome}
                   onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
          </div>
          <div className="campo">
            <label htmlFor="jn-nasc">Nascimento</label>
            <input id="jn-nasc" type="date" value={form.nascimento}
                   onChange={e => setForm(f => ({ ...f, nascimento: e.target.value }))} />
          </div>
        </>
      )}

      {conhecida && (
        <>
          {formas.length > 0 && (
            <div className="campo">
              <label htmlFor="jn-pag">Pagamento</label>
              <select id="jn-pag" value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)}>
                <option value="local">Pago no atendimento</option>
                {formas.map(f => <option key={f} value={f}>{NOMES[f] || f}</option>)}
              </select>
            </div>
          )}
          {!conhecida.cadastrada && (
            <label className="jn-check">
              <input type="checkbox" checked={form.aceitaMensagens}
                     onChange={e => setForm(f => ({ ...f, aceitaMensagens: e.target.checked }))} />
              Quero receber novidades e promoções no WhatsApp. Lembretes do meu horário
              eu recebo de qualquer forma.
            </label>
          )}
          <button className="b b-p b-larg"
                  disabled={ocupado || (!conhecida.cadastrada && form.nome.trim().length < 3)}
                  onClick={confirmar}>
            {ocupado ? 'Confirmando…' : 'Confirmar horário'}
          </button>
        </>
      )}
    </div>
  );
}

function Pronto({ resultado, escolha, servico, profissional, negocio, textos, aoFechar }) {
  return (
    <div className="jn-pronto">
      <div className="jn-pronto-marca"><Check size={30} /></div>
      <h3>{textos?.confirmacao || 'Pronto! Seu horário está reservado.'}</h3>
      <p>
        {resultado?.cliente?.primeiroNome && `${resultado.cliente.primeiroNome}, `}
        você recebe a confirmação no WhatsApp.
      </p>
      <dl className="jn-pronto-resumo">
        <ItemResumo rotulo="Serviço" valor={servico?.nome} />
        {profissional && <ItemResumo rotulo="Com" valor={profissional.nome} />}
        <ItemResumo rotulo="Quando" valor={`${porExtenso(escolha.data)} · ${escolha.hora}`} />
        {negocio.endereco && <ItemResumo rotulo="Onde" valor={negocio.endereco} />}
      </dl>
      <button className="b b-p b-larg" onClick={aoFechar}>Fechar</button>
    </div>
  );
}

/* ── calendário: montagem da grade ── */

/** Semana começando na segunda, com os dias vizinhos preenchendo as bordas. */
function montarMes(mes) {
  const [ano, m] = mes.split('-').map(Number);
  const primeiro = new Date(Date.UTC(ano, m - 1, 1));
  const diasNoMes = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  // getUTCDay: 0 = domingo. Queremos segunda como coluna 1.
  const deslocamento = (primeiro.getUTCDay() + 6) % 7;

  const celulas = [];
  for (let i = 0; i < deslocamento; i++) {
    const d = new Date(Date.UTC(ano, m - 1, 1 - (deslocamento - i)));
    celulas.push({ iso: d.toISOString().slice(0, 10), numero: d.getUTCDate(), doMes: false });
  }
  for (let d = 1; d <= diasNoMes; d++) {
    celulas.push({
      iso: `${ano}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      numero: d, doMes: true,
    });
  }
  while (celulas.length % 7 !== 0) {
    const d = new Date(Date.UTC(ano, m - 1, diasNoMes + (celulas.length % 7)));
    celulas.push({ iso: d.toISOString().slice(0, 10), numero: d.getUTCDate(), doMes: false });
  }
  return celulas;
}

function somarMes(mes, n) {
  const [ano, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(ano, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
