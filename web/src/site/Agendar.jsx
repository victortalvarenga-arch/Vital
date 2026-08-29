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
  { k: 'unidade', titulo: 'Onde você quer ser atendida?', ajuda: 'Escolha o endereço mais perto de você.' },
  { k: 'categoria', titulo: 'Escolha a categoria', ajuda: 'Depois você vê as opções dentro dela.' },
  { k: 'servico', titulo: 'Escolha o serviço', ajuda: 'O que você quer fazer hoje.' },
  { k: 'adicionais', titulo: 'Quer incluir algo mais?', ajuda: 'Serviços que combinam com o que você escolheu. Pode pular.' },
  { k: 'profissional', titulo: 'Escolha quem atende', ajuda: 'Você pode deixar que a gente escolha por você.' },
  { k: 'data', titulo: 'Selecione a data e horário', ajuda: 'Dias marcados têm horário disponível.' },
  { k: 'ficha', titulo: 'Só mais algumas perguntas', ajuda: 'A equipe precisa disso para te atender com segurança.' },
  { k: 'dados', titulo: 'Seus dados', ajuda: 'Só o WhatsApp, para você receber a confirmação.' },
  { k: 'pronto', titulo: 'Tudo certo', ajuda: '' },
];

export default function Agendar({ dados, servicoInicial, categoriaInicial, comboInicial, aoFechar }) {
  const { negocio, textos, exibir, profissionais } = dados;
  // Igual à home: o extra que só se vende junto não entra na escolha do
  // serviço principal, mas continua sendo encontrado como adicional.
  const servicos = dados.servicos.filter(s => !s.somenteAdicional);
  const combo = (dados.combos || []).find(c => c.id === comboInicial) || null;
  const unidades = dados.unidades || [];
  const [escolha, setEscolha] = useState(() => ({
    categoria: categoriaInicial
      || (servicoInicial ? servicos.find(x => x.id === servicoInicial)?.categoria : null)
      || null,
    servicoId: servicoInicial || null,
    comboId: comboInicial || null,
    unidadeId: null,
    adicionaisIds: [], profissionalId: null, data: null, hora: null, respostas: {},
  }));
  const [fichas, setFichas] = useState([]);
  const [confirmado, setConfirmado] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [resumoAberto, setResumoAberto] = useState(false);
  const janela = useRef(null);

  /**
   * O que está sendo comprado.
   *
   * Combo entra aqui com a mesma forma de um serviço — nome, preço, duração e
   * quem executa. Assim o resumo, a escolha de profissional e a confirmação
   * seguem funcionando sem um segundo caminho paralelo, que é onde as duas
   * versões acabariam divergindo.
   */
  const servico = combo
    ? { id: combo.id, nome: combo.nome, preco: combo.preco, duracao: combo.duracao,
        profissionais: combo.profissionais, ehCombo: true }
    : servicos.find(s => s.id === escolha.servicoId);
  // Quem está sem unidade atende em qualquer uma — é o estado de toda a equipe
  // de antes de existirem unidades.
  const daUnidade = p => !escolha.unidadeId || !p.unidadeId || p.unidadeId === escolha.unidadeId;
  const equipe = profissionais.filter(p => servico?.profissionais?.includes(p.id) && daUnidade(p));
  const profissional = profissionais.find(p => p.id === escolha.profissionalId);
  // Da lista completa: o extra escolhido pode ser um que não se vende sozinho,
  // e ele precisa aparecer no resumo e na confirmação como qualquer outro.
  const extras = dados.servicos.filter(x => escolha.adicionaisIds.includes(x.id));

  const categorias = useMemo(() => {
    const mapa = new Map();
    for (const x of servicos) {
      const c = x.categoria || 'Serviços';
      if (!mapa.has(c)) mapa.set(c, []);
      mapa.get(c).push(x);
    }
    return [...mapa].map(([nome, itens]) => ({ nome, itens }));
  }, [servicos]);

  const ofertados = dados.servicos.filter(x => servico?.adicionais?.includes(x.id));

  // O que a empresa vai perguntar neste serviço. Combo não tem ficha por ora —
  // são vários serviços, e cada um poderia pedir a sua.
  useEffect(() => {
    if (combo || !escolha.servicoId) return setFichas([]);
    let valeu = true;
    api.formularios(escolha.servicoId)
      .then(fs => { if (valeu) setFichas(fs); })
      .catch(() => { if (valeu) setFichas([]); });
    return () => { valeu = false; };
  }, [combo, escolha.servicoId]);

  /**
   * Passo que não tem o que perguntar é pulado.
   *
   * Com três passos opcionais, decidir isso com `if` espalhado vira bug: já
   * aconteceu de "voltar" cair num passo que a ida tinha pulado. Uma função só
   * decide, e a navegação anda por ela nos dois sentidos.
   */
  const util = useCallback(k => {
    // Empresa de um endereço só não responde a pergunta que não tem: o passo
    // some inteiro, e nada muda para quem sempre teve uma loja.
    if (k === 'unidade') return unidades.length > 1;
    // No combo o pacote já está fechado: não há categoria, serviço nem extra a
    // escolher, só quem atende e quando.
    if (combo) return k === 'profissional'
      ? exibir?.escolherProfissional && equipe.length > 1
      : ['unidade', 'data', 'dados', 'pronto'].includes(k);
    // Continua útil quando a janela abriu por uma categoria: é para lá que o
    // "Voltar" leva, e trocar de categoria sem fechar é o caminho natural.
    if (k === 'categoria') return !servicoInicial && exibir?.categorias && categorias.length > 1;
    if (k === 'adicionais') return ofertados.length > 0;
    // Serviço que não pede nada não ganha um passo vazio.
    if (k === 'ficha') return fichas.length > 0;
    if (k === 'profissional') return exibir?.escolherProfissional && equipe.length > 1;
    return true;
  }, [combo, servicoInicial, exibir, categorias.length, ofertados.length, equipe.length, unidades.length, fichas.length]);

  /**
   * A janela sempre abre no começo do fluxo.
   *
   * Antes ela pulava direto para o primeiro passo com pergunta pendente. Com
   * serviço já escolhido, sem adicionais cadastrados e uma profissional só,
   * isso caía no calendário com as bolinhas quase cheias — parecia que a
   * janela tinha continuado de onde parou.
   *
   * Clicar em "Agendar" num serviço não é jogado fora: ele já vem marcado, e
   * a lista abre filtrada na categoria dele. Vindo de uma categoria, a janela
   * abre direto na lista daquele grupo — a home não repete essa lista.
   */
  // A condição precisa ser a MESMA de util('categoria'). Com uma categoria só,
  // olhar a quantidade de serviços fazia a janela abrir num passo que util()
  // considera inválido — e aí o "Voltar" não tinha para onde ir e morria.
  const [passo, setPasso] = useState(() => {
    // A unidade vem antes de tudo quando existe: ela recorta quem atende, e
    // perguntá-la depois obrigaria a refazer as escolhas.
    if (util('unidade')) return 'unidade';
    if (comboInicial) return PASSOS.find(p => util(p.k))?.k || 'data';
    return !servicoInicial && !categoriaInicial && util('categoria') ? 'categoria' : 'servico';
  });

  const andar = (de, direcao) => {
    let i = PASSOS.findIndex(p => p.k === de) + direcao;
    while (i >= 0 && i < PASSOS.length && !util(PASSOS[i].k)) i += direcao;
    // Chegou na ponta sem achar passo útil: fica onde está.
    return (i < 0 || i >= PASSOS.length) ? de : PASSOS[i].k;
  };
  const avancar = () => setPasso(p => andar(p, 1));
  const primeiroUtil = PASSOS.find(p => util(p.k))?.k;

  const indice = PASSOS.findIndex(p => p.k === passo);
  const info = PASSOS[indice];
  // As bolinhas mostram só os passos que esta cliente vai ver de fato.
  const visiveis = PASSOS.filter(p => p.k !== 'pronto' && util(p.k));

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

  // Caiu num passo sem nada a perguntar: segue adiante sozinho.
  useEffect(() => {
    if (passo === 'pronto' || util(passo)) return;
    if (passo === 'profissional') {
      setEscolha(e => ({ ...e, profissionalId: equipe.length === 1 ? equipe[0].id : null }));
    }
    setPasso(p => andar(p, 1));
  }, [passo, util, equipe]);

  const voltar = () => {
    // No primeiro passo que esta cliente vê, "Voltar" fecha — e não tenta
    // recuar para um passo que foi pulado.
    if (passo === primeiroUtil) return aoFechar();
    setPasso(p => andar(p, -1));
  };

  // Preço só some quando a empresa esconde: aí não há total a mostrar. No
  // combo o total é o preço do pacote — nunca a soma dos serviços dentro dele.
  const total = servico?.preco == null
    ? null
    : Number(servico.preco) + extras.reduce((n, x) => n + Number(x.preco || 0), 0);

  return (
    <div className="jn-fundo" onMouseDown={e => e.target === e.currentTarget && aoFechar()}>
      <div className="jn" ref={janela} role="dialog" aria-modal="true" aria-label={info.titulo}>

        {/* coluna 1 — onde estou */}
        <aside className="jn-guia">
          <div className="jn-bolinhas" aria-hidden="true">
            {visiveis.map(p => (
              <span key={p.k}
                    className={'bolinha' + (PASSOS.findIndex(x => x.k === p.k) <= indice ? ' on' : '')} />
            ))}
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
            {passo === 'unidade' && (
              <Opcoes
                itens={unidades.map(u => ({ id: u.id, nome: u.nome, sub: u.endereco }))}
                marcado={escolha.unidadeId}
                aoEscolher={id => {
                  // Trocar de endereço invalida quem atende e quando: a equipe
                  // é outra. Zerar aqui evita confirmar com alguém que não
                  // trabalha no lugar escolhido.
                  setEscolha(e => ({ ...e, unidadeId: id, profissionalId: null, data: null, hora: null }));
                  avancar();
                }}
              />
            )}

            {passo === 'categoria' && (
              <Opcoes
                itens={categorias.map(c => ({
                  id: c.nome, nome: c.nome, foto: c.itens.find(x => x.foto)?.foto,
                  sub: `${c.itens.length} ${c.itens.length === 1 ? 'opção' : 'opções'}`,
                }))}
                aoEscolher={nome => {
                  setEscolha(e => ({ ...e, categoria: nome, servicoId: null, adicionaisIds: [] }));
                  setPasso('servico');
                }}
              />
            )}

            {passo === 'servico' && (
              <Opcoes
                marcado={escolha.servicoId}
                itens={(escolha.categoria
                  ? servicos.filter(x => (x.categoria || 'Serviços') === escolha.categoria)
                  : servicos
                ).map(s => ({
                  id: s.id, nome: s.nome, foto: s.foto, desc: s.descricao,
                  sub: [s.preco != null ? brl(s.preco) : 'Sob consulta',
                        exibir?.duracao ? duracaoTexto(s.duracao) : null].filter(Boolean).join(' · '),
                }))}
                aoEscolher={id => {
                  setEscolha(e => ({ ...e, servicoId: id, adicionaisIds: [], profissionalId: null, data: null, hora: null }));
                  setPasso('adicionais');
                }}
              />
            )}

            {passo === 'adicionais' && (
              <PassoAdicionais
                ofertados={ofertados} escolhidos={escolha.adicionaisIds} exibir={exibir}
                aoAlternar={id => setEscolha(e => ({
                  ...e,
                  // Mudar os extras muda a duração, e o horário escolhido pode
                  // não caber mais: a data volta a ser perguntada.
                  adicionaisIds: e.adicionaisIds.includes(id)
                    ? e.adicionaisIds.filter(x => x !== id)
                    : [...e.adicionaisIds, id],
                  data: null, hora: null,
                }))}
                aoSeguir={avancar}
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

            {passo === 'ficha' && (
              <PassoFicha
                fichas={fichas} respostas={escolha.respostas}
                aoMudar={(formId, lista) =>
                  setEscolha(e => ({ ...e, respostas: { ...e.respostas, [formId]: lista } }))}
                aoSeguir={avancar} aviso={setAviso}
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
                      profissional={profissional} extras={extras} negocio={negocio}
                      textos={textos} aoFechar={aoFechar} />
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
          servico={servico} profissional={profissional}
          unidade={unidades.find(u => u.id === escolha.unidadeId)} escolha={escolha}
          extras={extras} total={total}
          aberto={resumoAberto} aoAlternar={() => setResumoAberto(v => !v)}
        />

        {aviso && <div className="jn-aviso">{aviso}</div>}
      </div>
    </div>
  );
}

/* ── resumo ── */

function Resumo({ servico, profissional, unidade, escolha, extras, total, aberto, aoAlternar }) {
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
        {servico && <ItemResumo rotulo={servico.ehCombo ? 'Promoção' : 'Serviço'} valor={servico.nome} />}
        {unidade && <ItemResumo rotulo="Onde" valor={unidade.nome} />}
        {escolha.data && (
          <ItemResumo rotulo="Data e horário" valor={`${porExtenso(escolha.data)}${escolha.hora ? ` · ${escolha.hora}` : ''}`} />
        )}

        {extras?.length > 0 && (
          <div className="jn-item">
            <dt>Serviços adicionais</dt>
            {extras.map(x => (
              <dd key={x.id} className="jn-extra">
                {x.nome}
                {x.preco != null && <span>{brl(x.preco)}</span>}
              </dd>
            ))}
          </div>
        )}

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

function Opcoes({ itens, aoEscolher, marcado }) {
  if (!itens.length) return <p className="jn-vazio">Nada disponível por aqui.</p>;
  return (
    <div className="jn-opcoes">
      {itens.map(o => (
        <button key={o.id ?? 'qualquer'}
                className={'jn-opcao' + (marcado && o.id === marcado ? ' on' : '')}
                onClick={() => aoEscolher(o.id)}>
          {o.foto
            ? <img className="jn-opcao-foto" src={o.foto} alt="" />
            : <span className="jn-opcao-marca" style={o.cor ? { background: o.cor } : undefined}>
                {o.icone ? <User size={18} /> : o.nome.trim()[0].toUpperCase()}
              </span>}
          <span className="jn-opcao-txt">
            <span className="jn-opcao-nome">{o.nome}</span>
            {o.desc && <span className="jn-opcao-desc">{o.desc}</span>}
            {o.sub && <span className="jn-opcao-sub">{o.sub}</span>}
          </span>
          <ChevronRight size={18} className="jn-opcao-seta" />
        </button>
      ))}
    </div>
  );
}

/**
 * Extras oferecidos junto do serviço escolhido.
 *
 * Marcar é opcional e o botão de seguir fica sempre disponível: um passo que
 * obriga a escolher algo para sair vira obstáculo, e obstáculo no meio do
 * agendamento custa venda.
 */
function PassoAdicionais({ ofertados, escolhidos, exibir, aoAlternar, aoSeguir }) {
  const soma = ofertados
    .filter(x => escolhidos.includes(x.id))
    .reduce((n, x) => n + Number(x.preco || 0), 0);

  return (
    <>
      <div className="jn-opcoes">
        {ofertados.map(x => {
          const on = escolhidos.includes(x.id);
          return (
            <button key={x.id} className={'jn-opcao jn-add' + (on ? ' on' : '')}
                    onClick={() => aoAlternar(x.id)}
                    role="checkbox" aria-checked={on}>
              <span className={'jn-caixa' + (on ? ' on' : '')} aria-hidden="true">
                {on && <Check size={14} />}
              </span>
              {x.foto && <img className="jn-opcao-foto" src={x.foto} alt="" />}
              <span className="jn-opcao-txt">
                <span className="jn-opcao-nome">{x.nome}</span>
                <span className="jn-opcao-sub">
                  {x.preco != null ? `+ ${brl(x.preco)}` : 'Sob consulta'}
                  {exibir?.duracao && ` · + ${duracaoTexto(x.duracao)}`}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="jn-add-pe">
        {escolhidos.length > 0 && soma > 0 && (
          <p className="jn-add-soma">
            {escolhidos.length} {escolhidos.length === 1 ? 'adicional' : 'adicionais'} · + {brl(soma)}
          </p>
        )}
        <button className="b b-p b-larg" onClick={aoSeguir}>
          {escolhidos.length ? 'Continuar' : 'Continuar sem adicionais'}
        </button>
      </div>
    </>
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
        comboId: escolha.comboId || undefined,
        profissionalId: escolha.profissionalId || undefined,
        unidadeId: escolha.unidadeId || undefined,
        adicionais: escolha.adicionaisIds,
        mes,
      });
      setComVaga(new Set(r.dias));
    } catch (e) { aviso(e.message); setComVaga(new Set()); }
  }, [mes, escolha.servicoId, escolha.comboId, escolha.profissionalId, escolha.unidadeId, escolha.adicionaisIds, aviso]);

  useEffect(() => { carregarMes(); }, [carregarMes]);

  const abrirDia = async d => {
    setDia(d); setHoras(null);
    try {
      const r = await api.horarios({
        servicoId: escolha.servicoId,
        comboId: escolha.comboId || undefined,
        profissionalId: escolha.profissionalId || undefined,
        unidadeId: escolha.unidadeId || undefined,
        adicionais: escolha.adicionaisIds,
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

/**
 * As perguntas que a empresa faz antes de atender.
 *
 * Vem depois de escolher o horário e antes de dar o WhatsApp, de propósito:
 * quem chegou até aqui já decidiu, e responder três perguntas não faz desistir.
 * Perguntar antes da data faria — o passo apareceria antes de a pessoa saber se
 * existe horário para ela.
 *
 * A conferência de verdade é do servidor: o que falta aqui é só evitar a viagem
 * e apontar qual pergunta ficou em branco.
 */
function PassoFicha({ fichas, respostas, aoMudar, aoSeguir, aviso }) {
  const pega = (formId, campoId) =>
    (respostas[formId] || []).find(r => r.campoId === campoId)?.valor;

  const set = (formId, campoId, valor) => {
    const atuais = (respostas[formId] || []).filter(r => r.campoId !== campoId);
    aoMudar(formId, [...atuais, { campoId, valor }]);
  };

  const seguir = () => {
    for (const f of fichas) {
      for (const c of f.campos) {
        if (!c.obrigatorio) continue;
        const v = pega(f.id, c.id);
        const vazio = v === undefined || v === null || v === ''
          || (Array.isArray(v) && v.length === 0);
        if (vazio) return aviso(`Responda "${c.rotulo}".`);
      }
    }
    aoSeguir();
  };

  return (
    <div className="jn-ficha">
      {fichas.map(f => (
        <section key={f.id}>
          {f.descricao && <p className="jn-ficha-intro">{f.descricao}</p>}
          {f.campos.map(c => (
            <div key={c.id} className="jn-pergunta">
              <label>
                {c.rotulo}
                {c.obrigatorio && <span className="jn-obrig"> *</span>}
              </label>
              {c.ajuda && <p className="jn-ajuda">{c.ajuda}</p>}

              {c.tipo === 'longo' && (
                <textarea rows={3} value={pega(f.id, c.id) || ''}
                          onChange={e => set(f.id, c.id, e.target.value)} />
              )}
              {['texto', 'numero', 'data'].includes(c.tipo) && (
                <input
                  type={c.tipo === 'data' ? 'date' : c.tipo === 'numero' ? 'number' : 'text'}
                  inputMode={c.tipo === 'numero' ? 'decimal' : undefined}
                  value={pega(f.id, c.id) ?? ''}
                  onChange={e => set(f.id, c.id, e.target.value)} />
              )}
              {c.tipo === 'sim_nao' && (
                <div className="jn-opcoes">
                  {[['Sim', true], ['Não', false]].map(([rotulo, v]) => (
                    <button key={rotulo} type="button"
                            className={'jn-op' + (pega(f.id, c.id) === v ? ' on' : '')}
                            onClick={() => set(f.id, c.id, v)}>{rotulo}</button>
                  ))}
                </div>
              )}
              {c.tipo === 'escolha' && (
                <div className="jn-opcoes">
                  {c.opcoes.map(o => (
                    <button key={o} type="button"
                            className={'jn-op' + (pega(f.id, c.id) === o ? ' on' : '')}
                            onClick={() => set(f.id, c.id, o)}>{o}</button>
                  ))}
                </div>
              )}
              {c.tipo === 'multipla' && (
                <div className="jn-opcoes">
                  {c.opcoes.map(o => {
                    const marcadas = pega(f.id, c.id) || [];
                    return (
                      <button key={o} type="button"
                              className={'jn-op' + (marcadas.includes(o) ? ' on' : '')}
                              onClick={() => set(f.id, c.id, marcadas.includes(o)
                                ? marcadas.filter(x => x !== o)
                                : [...marcadas, o])}>{o}</button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </section>
      ))}

      <button className="b b-p b-larg" onClick={seguir}>Continuar</button>
    </div>
  );
}

function PassoDados({ escolha, negocio, aoConfirmar, aviso }) {
  const [fone, setFone] = useState('');
  const [conhecida, setConhecida] = useState(null);
  // Digitou o número de outra pessoa? O agendamento cairia no cadastro dela, e
  // o lembrete iria para o WhatsApp dela. Confirmar quem é evita isso.
  const [souEu, setSouEu] = useState(false);
  const [form, setForm] = useState({ nome: '', nascimento: '', aceitaMensagens: true });
  const [obs, setObs] = useState('');
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
        // Combo: o servidor monta os agendamentos em sequência e rateia o
        // preço. Mandar `servicoId` junto faria virar um agendamento avulso.
        ...(escolha.comboId ? { comboId: escolha.comboId } : { servicoId: escolha.servicoId }),
        profissionalId: escolha.profissionalId,
        data: escolha.data,
        hora: escolha.hora,
        formaPagamento,
        obs,
        adicionaisIds: escolha.adicionaisIds,
        respostas: escolha.respostas,
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
               onChange={e => { setFone(e.target.value); setConhecida(null); setSouEu(false); }}
               onBlur={checar} />
      </div>

      {conhecida === null && (
        <>
          <p className="ajuda">É por ele que você recebe a confirmação e o lembrete.</p>
          <button className="b b-p b-larg" disabled={!valido || ocupado} onClick={checar}>Continuar</button>
        </>
      )}

      {conhecida?.cadastrada && !souEu && (
        <div className="jn-confere">
          <p>Encontramos um cadastro em <strong>{conhecida.primeiroNome}</strong>.</p>
          <div className="jn-confere-btns">
            <button className="b b-p b-peq" onClick={() => setSouEu(true)}>Sou eu</button>
            <button className="b b-c b-peq" onClick={() => { setConhecida(null); setFone(''); }}>
              Não · corrigir número
            </button>
          </div>
        </div>
      )}

      {conhecida?.cadastrada && souEu && (
        <p className="ajuda">Oi de novo, {conhecida.primeiroNome}!</p>
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
            <input id="jn-nasc" type="date" required value={form.nascimento}
                   max={hojeISO()}
                   onChange={e => setForm(f => ({ ...f, nascimento: e.target.value }))} />
            <span className="jn-porque">Para te mandar um mimo no seu aniversário.</span>
          </div>
        </>
      )}

      {conhecida && (conhecida.cadastrada ? souEu : true) && (
        <>
          <div className="campo">
            <label htmlFor="jn-obs">
              Alguma observação? <span className="jn-opcional">opcional</span>
            </label>
            <textarea id="jn-obs" rows={3} maxLength={500} value={obs}
                      placeholder="Ex.: prefiro tons nude, sou alérgica a acetona, vou levar minha filha…"
                      onChange={e => setObs(e.target.value)} />
            <span className="jn-contador">{obs.length}/500</span>
          </div>

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
                  disabled={ocupado || (!conhecida.cadastrada
                    && (form.nome.trim().length < 3 || !form.nascimento))}
                  onClick={confirmar}>
            {ocupado ? 'Confirmando…' : 'Confirmar horário'}
          </button>
        </>
      )}
    </div>
  );
}

function Pronto({ resultado, escolha, servico, profissional, extras, negocio, textos, aoFechar }) {
  return (
    <div className="jn-pronto">
      <div className="jn-pronto-marca"><Check size={30} /></div>
      <h3>{textos?.confirmacao || 'Pronto! Seu horário está reservado.'}</h3>
      <p>
        {resultado?.cliente?.primeiroNome && `${resultado.cliente.primeiroNome}, `}
        você recebe a confirmação no WhatsApp.
      </p>
      <dl className="jn-pronto-resumo">
        <ItemResumo rotulo={servico?.ehCombo ? 'Promoção' : 'Serviço'} valor={servico?.nome} />
        {extras?.length > 0 && <ItemResumo rotulo="Adicionais" valor={extras.map(x => x.nome).join(', ')} />}
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
