import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Clock, MessageCircle, User, X } from 'lucide-react';
import * as api from '../shared/publico.js';
import { brl, duracaoTexto, hojeISO, mesDe, nomeDoMes, porExtenso, somarDias, soDigitos, mascaraFone } from './datas.js';
import { lugares, lugarDaUnidade } from './enderecos.js';
// `passo` aqui já é o estado do passo atual da janela — o do funil entra com
// outro nome para os dois não se confundirem.
import { idDaSessao, passo as medirPasso } from './medir.js';

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

/**
 * Serviço → data e horário → dados. É o caminho inteiro.
 *
 * Categoria, adicionais e "quem atende" já foram passos próprios: sete telas,
 * três delas pedindo decisão antes de a pessoa ver um horário sequer. Hoje a
 * lista de serviços é uma só (agrupada por categoria quando a empresa separa),
 * e extras e profissional são ajustes dentro da tela de data — quem não quer
 * mexer neles não os vê como pergunta.
 */
const PASSOS = [
  { k: 'unidade', titulo: 'Onde você quer ser atendida?', ajuda: 'Escolha o endereço mais perto de você.' },
  { k: 'servico', titulo: 'Escolha o serviço', ajuda: 'O que você quer fazer hoje.' },
  { k: 'data', titulo: 'Escolha data e horário', ajuda: 'Os dias em destaque têm horário livre. Toque num deles para ver as horas.' },
  { k: 'dados', titulo: 'Seus dados', ajuda: 'Só o WhatsApp, para você receber a confirmação.' },
  { k: 'pronto', titulo: 'Tudo certo', ajuda: '' },
];

/*
 * Houve aqui um passo de **ficha**, entre o horário e o WhatsApp, que
 * perguntava a anamnese do serviço (grávida? tipo de pele? usa ácido?). Saiu em
 * 2026-09-23: isso é dado de saúde, sensível na LGPD, e pedi-lo num site aberto
 * a quem ainda nem é cliente é risco que não se corre para marcar um horário.
 * Quem pergunta é a profissional, presencialmente, no começo do atendimento —
 * e o painel grava por `POST /api/agendamentos/:id/respostas`.
 *
 * Não é só uma tela a menos: o servidor também parou de exigir a ficha quando a
 * origem é o site, senão todo agendamento online passaria a ser recusado.
 */

export default function Agendar({ dados, servicoInicial, categoriaInicial, comboInicial, aoFechar }) {
  const { negocio, textos, exibir, profissionais } = dados;
  const combo = (dados.combos || []).find(c => c.id === comboInicial) || null;
  const unidades = dados.unidades || [];

  /**
   * A unidade é de quem atende, não do serviço (ver ARQUITETURA.md).
   *
   * Quem está sem unidade atende em qualquer uma — é o estado de toda a equipe
   * de antes de existirem unidades. E um serviço é oferecido num endereço
   * quando há ali alguém que o faça: oferecer "Facial" no Centro quando só a
   * Zona Sul tem quem faça leva a cliente por cinco telas até um calendário
   * sem dia nenhum.
   */
  const atendeEm = (p, unidadeId) => !unidadeId || !p.unidadeId || p.unidadeId === unidadeId;
  const ofertadoEm = (s, unidadeId) => !unidadeId
    || profissionais.some(p => s.profissionais?.includes(p.id) && atendeEm(p, unidadeId));

  // Abrindo por um serviço ou combo, só entram os endereços onde ele se faz.
  // Sobrou um? Não se pergunta — mas fica escolhido, para o resumo e a
  // confirmação dizerem onde.
  const alvoInicial = combo || (servicoInicial && dados.servicos.find(s => s.id === servicoInicial)) || null;
  const unidadesOfertadas = alvoInicial ? unidades.filter(u => ofertadoEm(alvoInicial, u.id)) : unidades;

  const [escolha, setEscolha] = useState(() => ({
    categoria: categoriaInicial
      || (servicoInicial ? dados.servicos.find(x => x.id === servicoInicial)?.categoria : null)
      || null,
    servicoId: servicoInicial || null,
    comboId: comboInicial || null,
    unidadeId: unidades.length > 1 && unidadesOfertadas.length === 1 ? unidadesOfertadas[0].id : null,
    adicionaisIds: [], profissionalId: null, data: null, hora: null,
  }));
  const [confirmado, setConfirmado] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [resumoAberto, setResumoAberto] = useState(false);
  const janela = useRef(null);

  // Segundo passo do funil: a janela abriu. Uma vez por visita — o servidor
  // deduplica, então reabrir não conta de novo.
  useEffect(() => { medirPasso('agendamento'); }, []);

  // Igual à home: o extra que só se vende junto não entra na escolha do
  // serviço principal, mas continua sendo encontrado como adicional. E só o
  // que se faz no endereço escolhido entra na lista.
  const servicos = dados.servicos.filter(s => !s.somenteAdicional && ofertadoEm(s, escolha.unidadeId));

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
  const equipe = profissionais.filter(p => servico?.profissionais?.includes(p.id) && atendeEm(p, escolha.unidadeId));
  const profissional = profissionais.find(p => p.id === escolha.profissionalId);
  // Onde vai ser: a unidade escolhida ou, quando o passo foi pulado, a de quem
  // atende. Nulo quando a empresa tem um endereço só — aí vale o da config.
  const unidade = lugarDaUnidade(dados, escolha.unidadeId || profissional?.unidadeId);
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

  /**
   * Passo que não tem o que perguntar é pulado.
   *
   * Com três passos opcionais, decidir isso com `if` espalhado vira bug: já
   * aconteceu de "voltar" cair num passo que a ida tinha pulado. Uma função só
   * decide, e a navegação anda por ela nos dois sentidos.
   */
  const util = useCallback(k => {
    // Empresa de um endereço só não responde a pergunta que não tem: o passo
    // some inteiro, e nada muda para quem sempre teve uma loja. O mesmo vale
    // quando o que a cliente abriu só se faz num dos endereços.
    if (k === 'unidade') return unidadesOfertadas.length > 1;
    // O cartão da home é a entrada do fluxo: quem clicou em "Limpeza de pele"
    // já escolheu, e não escolhe de novo. Combo idem — o pacote está fechado.
    if (k === 'servico') return !servicoInicial && !combo;
    return true;
  }, [combo, servicoInicial, unidadesOfertadas.length]);

  /**
   * A janela abre no primeiro passo que ainda tem pergunta.
   *
   * Serviço vindo do cartão cai direto no calendário; vindo de uma categoria,
   * na lista daquele grupo (com "ver todos" para trocar); do botão geral, na
   * lista inteira. Já foi o contrário — abrir sempre do começo, com o serviço
   * só marcado — e o custo era refazer três escolhas que a home já tinha
   * recebido. A unidade, quando existe, vem antes de tudo: ela recorta quem
   * atende, e perguntá-la depois obrigaria a refazer o resto.
   */
  const [passo, setPasso] = useState(() => PASSOS.find(p => util(p.k))?.k || 'data');

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
    setPasso(p => andar(p, 1));
  }, [passo, util]);

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
                itens={unidadesOfertadas.map(u => ({ id: u.id, nome: u.nome, sub: u.endereco }))}
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

            {passo === 'servico' && (
              <ListaDeServicos
                categorias={categorias} categoria={escolha.categoria} exibir={exibir}
                marcado={escolha.servicoId}
                aoVerTodos={() => setEscolha(e => ({ ...e, categoria: null }))}
                aoEscolher={id => {
                  setEscolha(e => ({ ...e, servicoId: id, adicionaisIds: [], profissionalId: null, data: null, hora: null }));
                  avancar();
                }}
              />
            )}

            {passo === 'data' && (
              <PassoData
                escolha={escolha} negocio={negocio} aviso={setAviso}
                equipe={exibir?.escolherProfissional && equipe.length > 1 ? equipe : []}
                ofertados={ofertados}
                aoMudarProfissional={id => setEscolha(e => ({ ...e, profissionalId: id, data: null, hora: null }))}
                aoAlternarAdicional={id => setEscolha(e => ({
                  ...e,
                  // Mudar os extras muda a duração, e o horário escolhido pode
                  // não caber mais: a agenda é consultada de novo.
                  adicionaisIds: e.adicionaisIds.includes(id)
                    ? e.adicionaisIds.filter(x => x !== id)
                    : [...e.adicionaisIds, id],
                  data: null, hora: null,
                }))}
                aoEscolher={(data, hora, profId) => {
                  setEscolha(e => ({ ...e, data, hora, profissionalId: profId ?? e.profissionalId }));
                  // Terceiro passo do funil: achou um horário que serve. É a
                  // fronteira entre "estava olhando" e "quer marcar".
                  medirPasso('horario');
                  // Por `avancar`, e não `setPasso('dados')`: a navegação anda
                  // pela lista de passos nos dois sentidos, e pular direto já
                  // fez um passo do meio ser esquecido por meses.
                  avancar();
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
                      profissional={profissional} extras={extras} dados={dados} unidade={unidade}
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
          servico={servico} profissional={profissional} unidade={unidade} escolha={escolha}
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
          {/* `alt=""`: a miniatura está dentro do botão, e o nome do serviço
              vem escrito ao lado dela. Descrevê-la faria o leitor de tela ler
              o mesmo nome duas vezes em cada item da lista. */}
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
 * A lista de serviços, uma só.
 *
 * Doze serviços cabem numa lista — a tela de categoria antes dela era um
 * toque a mais sem ganho. Quando a empresa separa por categoria, o grupo vira
 * um título dentro da lista, não uma tela. Vindo de um cartão de categoria da
 * home, a lista abre só naquele grupo, com "ver todos" para trocar.
 */
function ListaDeServicos({ categorias, categoria, exibir, marcado, aoEscolher, aoVerTodos }) {
  const grupos = categoria ? categorias.filter(c => c.nome === categoria) : categorias;
  const comTitulo = !categoria && exibir?.categorias && categorias.length > 1;

  return (
    <div className="jn-grupos">
      {/* Categoria que ficou sem serviço neste endereço: avisa, e o "ver
          todos" logo abaixo continua sendo a saída. */}
      {!grupos.some(g => g.itens.length) && <p className="jn-vazio">Nada disponível por aqui.</p>}
      {grupos.map(g => (
        <section key={g.nome} className="jn-grupo">
          {comTitulo && <h3 className="jn-grupo-titulo">{g.nome}</h3>}
          <Opcoes
            marcado={marcado}
            itens={g.itens.map(s => ({
              id: s.id, nome: s.nome, foto: s.foto, desc: s.descricao,
              sub: [s.preco != null ? brl(s.preco) : 'Sob consulta',
                    exibir?.duracao ? duracaoTexto(s.duracao) : null].filter(Boolean).join(' · '),
            }))}
            aoEscolher={aoEscolher}
          />
        </section>
      ))}
      {categoria && categorias.length > 1 && (
        <button className="jn-ver-todos" onClick={aoVerTodos}>
          Ver todos os serviços <ChevronRight size={15} />
        </button>
      )}
    </div>
  );
}

/**
 * Os ajustes da tela de data: com quem, e o que incluir.
 *
 * Eram dois passos próprios, cada um uma tela inteira antes de a pessoa ver
 * um horário. Aqui são duas linhas de pílulas em cima do calendário, e mexer
 * em qualquer uma consulta a agenda de novo — a duração e a equipe mudam. Quem
 * não quer mexer não precisa responder nada.
 */
function Ajustes({ escolha, equipe, ofertados, aoMudarProfissional, aoAlternarAdicional }) {
  if (!equipe.length && !ofertados.length) return null;
  return (
    <div className="cal-ajustes">
      {equipe.length > 0 && (
        <div className="cal-ajuste" role="radiogroup" aria-label="Com quem">
          <span className="cal-ajuste-rotulo">Com quem</span>
          <div className="pilulas">
            <button type="button" role="radio" aria-checked={!escolha.profissionalId}
                    className={'jn-op' + (!escolha.profissionalId ? ' on' : '')}
                    onClick={() => aoMudarProfissional(null)}>
              Qualquer
            </button>
            {equipe.map(p => (
              <button key={p.id} type="button" role="radio" aria-checked={escolha.profissionalId === p.id}
                      className={'jn-op' + (escolha.profissionalId === p.id ? ' on' : '')}
                      onClick={() => aoMudarProfissional(p.id)}>
                {p.nome}
              </button>
            ))}
          </div>
        </div>
      )}
      {ofertados.length > 0 && (
        <div className="cal-ajuste">
          <span className="cal-ajuste-rotulo">Incluir</span>
          <div className="pilulas">
            {ofertados.map(x => {
              const on = escolha.adicionaisIds.includes(x.id);
              return (
                <button key={x.id} type="button" role="checkbox" aria-checked={on}
                        className={'jn-op' + (on ? ' on' : '')}
                        onClick={() => aoAlternarAdicional(x.id)}>
                  {on && <Check size={13} />}
                  {x.nome}
                  {x.preco != null && <span className="jn-op-preco">+ {brl(x.preco)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Data e horário na mesma tela.
 *
 * Calendário de um lado, as horas do outro (no celular, uma embaixo da outra):
 * a pessoa vê se sobrou horário que serve antes de se comprometer com o dia.
 * O primeiro dia com vaga já abre selecionado, para a coluna de horas não
 * nascer vazia — e as horas vêm agrupadas em manhã, tarde e noite, que é como
 * a pessoa pensa ("de tarde eu consigo").
 *
 * Toda situação sem horário tem texto e saída: mês cheio, mês que a agenda
 * ainda não abriu, dia sem vaga. Calendário cinza sem uma palavra é o que a
 * cliente de verdade vê toda vez que a agenda lota, e ela precisa de um
 * caminho — o WhatsApp — em vez de um beco.
 */
function PassoData({ escolha, negocio, equipe, ofertados, aoMudarProfissional, aoAlternarAdicional, aoEscolher, aviso }) {
  const hoje = hojeISO();
  const [mes, setMes] = useState(mesDe(hoje));
  const [comVaga, setComVaga] = useState(null);   // null = consultando
  const [dia, setDia] = useState(null);
  const [horas, setHoras] = useState(null);       // null = buscando
  const painelHoras = useRef(null);
  // Cada consulta leva um número; resposta de consulta velha (trocou de mês
  // antes de voltar) é ignorada, senão ela pinta por cima da nova.
  const vezMes = useRef(0), vezDia = useRef(0);

  const consulta = useMemo(() => ({
    servicoId: escolha.servicoId,
    comboId: escolha.comboId || undefined,
    profissionalId: escolha.profissionalId || undefined,
    unidadeId: escolha.unidadeId || undefined,
    adicionais: escolha.adicionaisIds,
  }), [escolha.servicoId, escolha.comboId, escolha.profissionalId, escolha.unidadeId, escolha.adicionaisIds]);

  const abrirDia = useCallback(async d => {
    const minha = ++vezDia.current;
    setDia(d); setHoras(null);
    try {
      const r = await api.horarios({ ...consulta, data: d });
      if (minha !== vezDia.current) return;
      setHoras(r.horarios
        ? r.horarios.map(h => ({ hora: h }))
        : (r.porProfissional || []).flatMap(p => p.horarios.map(h => ({ hora: h, profissionalId: p.profissionalId }))));
    } catch (e) {
      if (minha !== vezDia.current) return;
      aviso(e.message); setHoras([]);
    }
  }, [consulta, aviso]);

  const carregarMes = useCallback(async () => {
    const minha = ++vezMes.current;
    setComVaga(null); setDia(null); setHoras(null);
    try {
      const r = await api.diasLivres({ ...consulta, mes });
      if (minha !== vezMes.current) return;
      setComVaga(new Set(r.dias));
      if (r.dias[0]) abrirDia(r.dias[0]);
    } catch (e) {
      if (minha !== vezMes.current) return;
      aviso(e.message); setComVaga(new Set());
    }
  }, [mes, consulta, aviso, abrirDia]);

  useEffect(() => { carregarMes(); }, [carregarMes]);

  // Sem profissional escolhido, o mesmo horário pode vir de várias pessoas.
  const horasUnicas = useMemo(() => {
    const vistas = new Map();
    for (const h of horas || []) if (!vistas.has(h.hora)) vistas.set(h.hora, h);
    return [...vistas.values()].sort((a, b) => a.hora.localeCompare(b.hora));
  }, [horas]);

  const grade = useMemo(() => montarMes(mes), [mes]);
  // A agenda abre até `janelaDias` à frente: navegar além disso só mostraria
  // mês vazio atrás de mês vazio.
  const mesMinimo = mesDe(hoje);
  const mesMaximo = mesDe(somarDias(hoje, negocio.janelaDias || 30));
  const semVagaNoMes = comVaga !== null && comVaga.size === 0;
  const zap = negocio.whatsapp ? `https://wa.me/55${soDigitos(negocio.whatsapp)}` : null;

  // Com as horas embaixo do calendário (tela estreita), tocar num dia as traz
  // para a vista; ao lado, `nearest` não move nada. Só no toque — na abertura
  // automática do primeiro dia a rolagem tiraria o calendário da vista antes
  // de a pessoa vê-lo.
  const tocarDia = iso => {
    abrirDia(iso);
    painelHoras.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  return (
    <>
    <Ajustes escolha={escolha} equipe={equipe} ofertados={ofertados}
             aoMudarProfissional={aoMudarProfissional} aoAlternarAdicional={aoAlternarAdicional} />
    <div className="cal-duplo">
      <div className="cal-lado">
        <div className="cal-topo">
          <button className="cal-nav" disabled={mes <= mesMinimo} aria-label="Mês anterior"
                  onClick={() => setMes(somarMes(mes, -1))}>
            <ChevronLeft size={18} />
          </button>
          <strong className="cal-mes">{nomeDoMes(mes)}</strong>
          <button className="cal-nav" disabled={mes >= mesMaximo} aria-label="Próximo mês"
                  onClick={() => setMes(somarMes(mes, 1))}>
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="cal">
          {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map(d => (
            <span key={d} className="cal-cab">{d}</span>
          ))}
          {grade.map(({ iso, numero, doMes }, i) => {
            const livre = !!comVaga?.has(iso);
            const passado = iso < hoje;
            const ehHoje = iso === hoje;
            const classes = ['cal-dia', !doMes && 'fora', passado && 'passado', ehHoje && 'hoje',
              livre && 'livre', iso === dia && 'on'].filter(Boolean).join(' ');
            return (
              <button
                key={i}
                className={classes}
                disabled={!livre}
                onClick={() => tocarDia(iso)}
                aria-current={ehHoje ? 'date' : undefined}
                aria-pressed={livre ? iso === dia : undefined}
                aria-label={`${porExtenso(iso)}${ehHoje ? ', hoje' : ''} — ${
                  livre ? 'tem horário' : passado ? 'já passou' : 'sem horário'}`}
              >
                {numero}
              </button>
            );
          })}
        </div>
        <p className="cal-legenda" aria-hidden="true">
          <span><i className="cal-legenda-livre" /> com horário</span>
          <span><i className="cal-legenda-hoje" /> hoje</span>
        </p>
        {comVaga === null && <p className="jn-vazio">Consultando a agenda…</p>}
      </div>

      <div className="cal-horas" ref={painelHoras}>
        {semVagaNoMes && (
          <VazioAgenda
            titulo={`Sem horários em ${nomeDoMes(mes).split(' ')[0].toLowerCase()}`}
            texto={textoMesCheio({ temProximo: mes < mesMaximo, temZap: !!zap })}
            zap={zap}
            acao={mes < mesMaximo && (
              <button className="b b-c b-peq" onClick={() => setMes(somarMes(mes, 1))}>
                Ver o próximo mês <ChevronRight size={15} />
              </button>
            )} />
        )}

        {dia && (
          <>
            <h4>{porExtenso(dia)}</h4>
            {horas === null && <p className="jn-vazio">Buscando horários…</p>}
            {horas?.length === 0 && (
              <VazioAgenda
                titulo="Não há horários nesta data"
                texto="Escolha outro dia em destaque no calendário, ou fale com a gente."
                zap={zap} />
            )}
            {porPeriodo(horasUnicas).map(p => (
              <div key={p.nome} className="horas-grupo">
                <h5>{p.nome}</h5>
                <div className="horas">
                  {p.horas.map(h => (
                    <button key={h.hora} className="hora"
                            onClick={() => aoEscolher(dia, h.hora, h.profissionalId)}>
                      {h.hora}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
    </>
  );
}

/** A frase do mês cheio só promete a saída que existe. */
function textoMesCheio({ temProximo, temZap }) {
  const saidas = [temProximo && 'veja o mês seguinte', temZap && 'fale com a gente'].filter(Boolean);
  if (!saidas.length) return 'A agenda deste mês está cheia.';
  const frase = saidas.join(' ou ');
  return `A agenda deste mês está cheia. ${frase[0].toUpperCase()}${frase.slice(1)}`
    + (temZap ? ' — às vezes abre uma vaga.' : '.');
}

/** Manhã / tarde / noite — só os períodos que têm hora. */
const PERIODOS = [['Manhã', '00:00', '12:00'], ['Tarde', '12:00', '18:00'], ['Noite', '18:00', '24:00']];
const porPeriodo = horas => PERIODOS
  .map(([nome, de, ate]) => ({ nome, horas: horas.filter(h => h.hora >= de && h.hora < ate) }))
  .filter(p => p.horas.length);

/**
 * O estado vazio da agenda: o que aconteceu, e por onde sair.
 *
 * O WhatsApp fica dentro da própria tela, não só na coluna da esquerda (que
 * no celular nem aparece): quem não achou horário precisa da saída na mão.
 */
function VazioAgenda({ titulo, texto, zap, acao }) {
  return (
    <div className="agenda-vazia" role="status">
      <strong>{titulo}</strong>
      <p>{texto}</p>
      <div className="agenda-vazia-acoes">
        {acao}
        {zap && (
          <a className="b b-c b-peq" href={zap} target="_blank" rel="noreferrer">
            <MessageCircle size={15} /> Falar no WhatsApp
          </a>
        )}
      </div>
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
        // Quem é esta visita, para o servidor fechar o funil e ligar o
        // agendamento ao comparecimento. Não identifica ninguém: é um número
        // sorteado no navegador, que morre ao fechar a aba.
        sessao: idDaSessao(),
        // Combo: o servidor monta os agendamentos em sequência e rateia o
        // preço. Mandar `servicoId` junto faria virar um agendamento avulso.
        ...(escolha.comboId ? { comboId: escolha.comboId } : { servicoId: escolha.servicoId }),
        profissionalId: escolha.profissionalId,
        data: escolha.data,
        hora: escolha.hora,
        formaPagamento,
        obs,
        adicionaisIds: escolha.adicionaisIds,
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

function Pronto({ resultado, escolha, servico, profissional, extras, dados, unidade, textos, aoFechar }) {
  // O endereço da unidade onde vai ser, quando há mais de uma; senão o único
  // que o site mostra. Nunca a config por cima da unidade — seria o hero e a
  // janela dizendo endereços diferentes de novo.
  const onde = unidade
    ? `${unidade.nome} · ${unidade.endereco}`
    : (lugares(dados).length === 1 ? lugares(dados)[0].endereco : null);
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
        {onde && <ItemResumo rotulo="Onde" valor={onde} />}
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
