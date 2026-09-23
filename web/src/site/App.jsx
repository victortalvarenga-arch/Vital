import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar, ChevronRight, Clock, Instagram, MapPin, MessageCircle,
  Phone, Plus, Sparkles, TriangleAlert,
} from 'lucide-react';
import * as api from '../shared/publico.js';
import { aplicarTema } from './tema.js';
import { brl, duracaoTexto, soDigitos } from './datas.js';
import { lugares } from './enderecos.js';
import { aplicarSeo } from './seo.js';
import { linkGeral, linkServico } from './whatsapp.js';
import { passo } from './medir.js';
import Agendar from './Agendar.jsx';
import Grade from './Grade.jsx';
import {
  HeroClinica, TituloClinica, CartoesClinica, SecaoEquipe, SecaoAntesDepois,
  SecaoAvaliacoes, SecaoAgende, SecaoInstagram, SecaoMapa, BotaoWhatsApp,
  altDaCapa, altDoServico,
} from './Clinica.jsx';

export default function App() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [agendando, setAgendando] = useState(null);   // { servicoId } | null

  useEffect(() => {
    api.vitrine()
      .then(d => {
        setDados(d);
        // ?template=quadro por cima da config salva — pré-visualizar um
        // modelo sem precisar gravar nada, do painel ou de um link só seu.
        const doLink = new URLSearchParams(location.search).get('template');
        aplicarTema(doLink ? { ...d.marca, template: doLink } : d.marca);
        // Título, descrição e o schema de negócio local — sem isto toda
        // empresa herda o <title> do index.html e some das buscas por serviço
        // e cidade. Ver `seo.js`.
        aplicarSeo(d, lugares(d));
        // Primeiro passo do funil. Depois da vitrine responder, não antes:
        // empresa suspensa ou endereço errado não são visita de ninguém.
        passo('site');
      })
      .catch(e => setErro(e.message));
  }, []);

  if (erro) return (
    <div className="centro">
      <div>
        <TriangleAlert size={32} color="var(--marca)" />
        <h2 style={{ margin: 'var(--e-4) 0 var(--e-2)', fontSize: 'var(--t-titulo)' }}>Não consegui carregar</h2>
        <p style={{ color: 'var(--cinza)', fontSize: 'var(--t-corpo-pq)', maxWidth: 340 }}>
          Tente recarregar a página em instantes.
        </p>
      </div>
    </div>
  );

  if (!dados) return <div className="centro"><p style={{ color: 'var(--fraco)' }}>Carregando…</p></div>;

  return (
    <>
      <Home
        dados={dados}
        aoAgendar={servicoId => setAgendando({ servicoId, chave: Date.now() })}
        aoAbrirCategoria={categoria => setAgendando({ categoria, chave: Date.now() })}
        aoAgendarCombo={comboId => setAgendando({ comboId, chave: Date.now() })}
      />
      {agendando && (
        <Agendar
          /* A chave muda a cada abertura: garante janela nova, do zero, mesmo
             se um dia alguém abrir outro serviço sem fechar o anterior. */
          key={agendando.chave}
          dados={dados}
          servicoInicial={agendando.servicoId}
          categoriaInicial={agendando.categoria}
          comboInicial={agendando.comboId}
          aoFechar={() => setAgendando(null)}
        />
      )}
    </>
  );
}

/**
 * Barra que flutua sobre a capa e se firma ao rolar.
 *
 * Sobre a foto ela é transparente, com um véu escuro por baixo do texto —
 * capa clara com texto branco seria ilegível, e não dá para saber que foto a
 * empresa vai subir. Passado o topo, vira sólida. Sem foto de capa não há
 * nada para flutuar sobre — a barra nasce firme, porque texto branco sobre
 * o fundo claro do cabeçalho ficaria ilegível.
 */
function BarraTopo({ negocio, marca, aoAgendar, temCapa, secoes }) {
  const [rolou, setRolou] = useState(false);
  const firme = !temCapa || rolou;
  // Na Clínica a marca da barra é o nome em caixa-alta espaçada, como na
  // referência: o logo a 30px vira uma mancha que não se lê, e a cliente
  // pediu para tirar.
  const comLogo = marca?.logo && marca.template !== 'clinica';

  useEffect(() => {
    if (!temCapa) return;
    const aoRolar = () => setRolou(window.scrollY > 120);
    aoRolar();
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => window.removeEventListener('scroll', aoRolar);
  }, [temCapa]);

  return (
    <header className={'barra' + (firme ? ' firme' : '')}>
      <div className="env-largo barra-in">
        <div className="barra-marca">
          {/* `alt=""`: o nome do negócio vem logo ao lado, em texto. Descrever
              o logo aqui faria o leitor de tela dizê-lo duas vezes seguidas. */}
          {comLogo && <img className="barra-logo" src={marca.logo} alt="" />}
          <span className="barra-nome">{negocio.nome}</span>
        </div>
        {/* Navegação por seção — só o modelo que tem seções o bastante pra
            isso passa a lista; nos outros a barra continua só com as ações. */}
        {secoes?.length > 0 && (
          <nav className="barra-nav" aria-label="Seções">
            {secoes.map(([rotulo, id]) => <a key={id} href={`#${id}`}>{rotulo}</a>)}
          </nav>
        )}
        <nav className="barra-acoes">
          {negocio.whatsapp && (
            <a className="barra-link" href={`https://wa.me/55${soDigitos(negocio.whatsapp)}`}
               target="_blank" rel="noreferrer">
              <MessageCircle size={16} /> <span>Falar</span>
            </a>
          )}
          {/* "Minha conta" entra com o login da cliente (Bloco 5 do ROADMAP).
              Um botão que não leva a lugar nenhum seria pior que a ausência. */}
          <button className="b b-p b-peq" onClick={() => aoAgendar(null)}>
            <Calendar size={15} /> Agendar
          </button>
        </nav>
      </div>
    </header>
  );
}

/**
 * Os endereços da empresa, um link por lugar.
 *
 * Vem de `lugares()`: as unidades quando há mais de uma, senão o endereço da
 * config. É o mesmo componente no hero, no rodapé e na Clínica, para o site
 * nunca dizer um endereço num canto e outro no seguinte.
 */
export function Lugares({ dados, className, tamanho = 15 }) {
  return lugares(dados).map(l => (
    <a key={l.id || 'sede'} className={className} href={l.mapa} target="_blank" rel="noreferrer">
      <MapPin size={tamanho} />
      <span>{l.nome && <b>{l.nome} · </b>}{l.endereco}</span>
    </a>
  ));
}

/* ── revelar ao rolar ──────────────────────────────────────────────
   Discreto de propósito: a página existe para agendar rápido, não para
   impressionar. Quem pediu menos movimento no sistema não vê nada.

   **O conteúdo tem de aparecer mesmo quando o gatilho não dispara.** Três
   coisas garantem isso, porque a animação escondia seção de verdade:

   1. `threshold: 0.12` pedia 12% do elemento visível — um bloco mais alto que
      a tela nunca chega a 12% e ficava invisível para sempre.
   2. A margem agora é POSITIVA embaixo: o bloco começa a aparecer um quinto de
      tela antes de entrar, e chega opaco. Era o sintoma de "rolando rápido, a
      seção fica quase invisível" — a transição de meio segundo começava tarde
      demais e a pessoa já tinha passado.
   3. Sem IntersectionObserver (webview antigo), revela na hora.
   4. Uma rede curta: passado o tempo da transição, o que já estiver na tela e
      continuar escondido aparece. Só o que já deveria estar visível — revelar
      a página inteira por tempo mataria o efeito para quem está no topo.

   E o `opacity: 0` do CSS só vale com a classe `js` no <html> (main.jsx), então
   página sem JavaScript nenhum nasce inteira. */
const ESPERA_MAXIMA = 1200;

export function useRevelar() {
  const ref = useRef(null);
  useEffect(() => {
    const alvo = ref.current;
    if (!alvo) return;
    const revelar = () => alvo.classList.add('visivel');

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        || typeof IntersectionObserver === 'undefined') {
      revelar();
      return;
    }

    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { revelar(); obs.disconnect(); }
    }, { threshold: 0, rootMargin: '0px 0px 20% 0px' });
    obs.observe(alvo);

    const rede = setTimeout(() => {
      // Já está na tela e continua escondido: o observador não fez o trabalho.
      if (alvo.getBoundingClientRect().top < window.innerHeight) { revelar(); obs.disconnect(); }
    }, ESPERA_MAXIMA);

    return () => { clearTimeout(rede); obs.disconnect(); };
  }, []);
  return ref;
}

export const Revela = ({ children, className = '' }) => {
  const ref = useRevelar();
  return <div ref={ref} className={`revela ${className}`}>{children}</div>;
};

/* ── home ── */

function Home({ dados, aoAgendar, aoAbrirCategoria, aoAgendarCombo }) {
  const { negocio, marca, textos, exibir } = dados;
  const combos = dados.combos || [];

  // O que se vende sozinho. Quem está marcado como "só adicional" continua
  // vindo na resposta — o passo de extras precisa do nome e do preço — mas não
  // ocupa lugar na vitrine nem numa categoria.
  const servicos = dados.servicos.filter(s => !s.somenteAdicional);

  const categorias = useMemo(() => {
    const mapa = new Map();
    for (const s of servicos) {
      const c = s.categoria || 'Serviços';
      if (!mapa.has(c)) mapa.set(c, []);
      mapa.get(c).push(s);
    }
    return [...mapa].map(([nome, itens]) => ({ nome, itens }));
  }, [servicos]);

  // Clínica é o único modelo com um cabeçalho de duas colunas e seções
  // próprias (tudo em Clinica.jsx) — o resto do esqueleto (barra, .capa como
  // faixa solta, .identidade empilhada) é compartilhado pelos outros três de
  // propósito. Uma estrutura por modelo só se justifica quando o próprio
  // modelo pede uma composição diferente, não uma variação de cor — ver "Do
  // build new site markup..." no DESIGN.md.
  const ehClinica = marca?.template === 'clinica';
  // A barra é fixa e, sem uma faixa de capa embaixo dela pra absorver a
  // sobreposição, ela cobre o topo do que vier em seguida — cortava a foto
  // ou a inicial da Clínica, e cortava o nome de qualquer empresa sem capa
  // nos outros três modelos. Só a faixa .capa clássica (260px, bem mais alta
  // que a barra) tem folga o bastante para a barra flutuar por cima sem
  // esconder nada; nos outros casos, .identidade precisa da própria folga.
  const temFaixaDeCapa = !ehClinica && !!marca?.capa;

  // Só as seções que existem de verdade nesta empresa entram na barra — um
  // link para uma âncora que não renderizou é um clique pra lugar nenhum.
  const secoesClinica = ehClinica ? [
    ['Serviços', 'servicos'],
    ...(dados.profissionais?.length ? [['Equipe', 'equipe']] : []),
    ['Avaliações', 'avaliacoes'],
    ...(negocio.instagram ? [['Instagram', 'instagram']] : []),
    ...(lugares(dados).length ? [['Contato', 'contato']] : []),
  ] : null;

  return (
    <main>
      <BarraTopo negocio={negocio} marca={marca} aoAgendar={aoAgendar}
                 temCapa={temFaixaDeCapa} secoes={secoesClinica} />

      {ehClinica ? (
        <HeroClinica dados={dados} negocio={negocio} marca={marca} textos={textos} aoAgendar={aoAgendar} />
      ) : (
        <>
          {/* A foto de capa, quando existe, é uma peça acima do cabeçalho —
              não o cabeçalho em si. Sem foto (o caso de hoje, sem nenhuma
              empresa com imagem enviada), o nome já nasce sobre o fundo
              lavado da marca: nada de mancha de gradiente fingindo ser
              imagem. */}
          {marca?.capa && (
            <div className="capa">
              <img src={marca.capa} alt={altDaCapa(negocio)} />
              <div className="capa-veu" aria-hidden="true" />
            </div>
          )}

          <div className={'identidade' + (!temFaixaDeCapa ? ' identidade-sem-capa' : '')}>
            <div className="env identidade-in">
              <Logo marca={marca} nome={negocio.nome} />
              <h1>{negocio.nome}</h1>
              {/* A frase que a empresa escreveu para quem acabou de chegar,
                  quando existe; senão o slogan de sempre. */}
              {(textos?.hero || negocio.slogan) && (
                <p className="slogan">{textos?.hero || negocio.slogan}</p>
              )}
              <Lugares dados={dados} className="local" />
              <div className="chamada">
                <button className="b b-p b-larg" onClick={() => aoAgendar(null)}>
                  <Calendar size={18} /> {textos?.chamada || 'Agende seu horário'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {negocio.sobre && (
        <section id="sobre" className={'bloco' + (ehClinica ? ' clinica-sobre' : '')}>
          <div className="env">
            <Revela>
              {ehClinica && <p className="olho">Sobre</p>}
              <p className="sobre">{negocio.sobre}</p>
            </Revela>
          </div>
        </section>
      )}

      {/* O primeiro combo ganha o tratamento grande — campo de cor cheio, preço
          em escala de destaque. É a promoção que a empresa mais quer empurrar
          agora; comparar vários lado a lado é para o que sobrar, na grade
          menor logo abaixo. */}
      {combos.length > 0 && (
        <section className="bloco">
          <div className="env-largo">
            <Destaque combo={combos[0]} exibir={exibir} aoAgendar={aoAgendarCombo} />
            {combos.length > 1 && (
              <>
                <h2 className="bloco-titulo" style={{ marginTop: 'var(--e-8)' }}>Mais promoções</h2>
                <Promocoes itens={combos.slice(1)} exibir={exibir} aoAgendar={aoAgendarCombo} />
              </>
            )}
          </div>
        </section>
      )}

      {/* Bloco com fundo próprio: separa os serviços do resto sem precisar de
          linha divisória, e é o pedaço que a pessoa veio ver. */}
      <section id="servicos" className="bloco bloco-marca">
        <div className="env-largo">
          {ehClinica
            ? <TituloClinica olho="Serviços">Escolha o seu <em>momento.</em></TituloClinica>
            : <Revela><h2 className="bloco-titulo">Serviços</h2></Revela>}
          {servicos.length === 0 && <p className="vazio">Nenhum serviço disponível no momento.</p>}
          {/* Na Clínica, cartões com foto larga (pedido da cliente, a partir
              da referência); nos outros três, a grade de círculos. Os dois
              respeitam "separar por categoria" do mesmo jeito. */}
          {ehClinica
            ? <CartoesClinica servicos={servicos} categorias={categorias} exibir={exibir}
                              negocio={negocio} aoAgendar={aoAgendar} aoAbrir={aoAbrirCategoria} />
            : exibir?.categorias && categorias.length > 1
              ? <Categorias categorias={categorias} negocio={negocio} aoAbrir={aoAbrirCategoria} />
              : <Servicos itens={servicos} exibir={exibir} textos={textos} negocio={negocio}
                          aoAgendar={aoAgendar} />}
        </div>
      </section>

      {/* O que vem daqui pra baixo é exclusivo do modelo Clínica — a
          referência (inspiraestetica.com.br) tem essas seções, os outros
          três modelos não pediram nenhuma delas. */}
      {ehClinica && (
        <>
          <SecaoEquipe profissionais={dados.profissionais} />
          <SecaoAntesDepois casos={dados.antesDepois} />
          <SecaoAvaliacoes />
          <SecaoAgende textos={textos} aoAgendar={aoAgendar} />
          <SecaoInstagram negocio={negocio} marca={marca} posts={dados.instagramPosts} />
        </>
      )}

      {/* Dúvida que não é respondida vira desistência, e isso não é
          particularidade de modelo nenhum: a seção é dos quatro. */}
      <Perguntas faq={dados.faq} negocio={negocio} ehClinica={ehClinica} />

      {ehClinica && <SecaoMapa dados={dados} />}

      <Rodape dados={dados} negocio={negocio} textos={textos} cheio={ehClinica} />
      {ehClinica && <BotaoWhatsApp negocio={negocio} />}
    </main>
  );
}

/**
 * "Tirar uma dúvida" em cada serviço, com a mensagem já escrita.
 *
 * Secundário de propósito — link, não botão: agendar é a ação da vitrine, e
 * dois botões com o mesmo peso fariam a pessoa parar para escolher. Some
 * inteiro quando a empresa não cadastrou WhatsApp.
 */
export function PerguntarSobre({ negocio, servico, className = 'svc-duvida' }) {
  const href = linkServico(negocio, servico);
  if (!href) return null;
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer"
       aria-label={`Tirar dúvida sobre ${servico.nome} no WhatsApp`}>
      <MessageCircle size={14} /> Tirar dúvida
    </a>
  );
}

/**
 * Perguntas frequentes.
 *
 * `<details>`/`<summary>` em vez de acordeão com estado: abre e fecha sem
 * JavaScript, o teclado já anda por ele, o leitor de tela anuncia o estado, e
 * o texto da resposta existe no HTML mesmo fechado — que é o que um buscador
 * lê. Um acordeão nosso custaria as quatro coisas para ganhar nada.
 *
 * O conteúdo é da empresa (config `faq`): a dúvida que trava uma venda muda de
 * ramo para ramo, e escrever uma lista nossa seria pôr palavra de estética na
 * boca de uma oficina. Sem pergunta cadastrada, a seção não existe.
 */
function Perguntas({ faq = [], negocio, ehClinica }) {
  if (!faq.length) return null;
  const zap = linkGeral(negocio, 'Olá! Vim pelo site e fiquei com uma dúvida.');
  return (
    <section id="perguntas" className="bloco">
      <div className="env">
        {ehClinica
          ? <TituloClinica olho="Dúvidas">Perguntas que a gente <em>sempre ouve.</em></TituloClinica>
          : <Revela><h2 className="bloco-titulo">Perguntas frequentes</h2></Revela>}

        <div className="faq">
          {faq.map((p, i) => (
            <Revela key={p.pergunta} className={`atraso-${Math.min(i, 5)}`}>
              <details className="faq-item">
                <summary>
                  <span>{p.pergunta}</span>
                  <Plus className="faq-mais" size={17} aria-hidden="true" />
                </summary>
                <p>{p.resposta}</p>
              </details>
            </Revela>
          ))}
        </div>

        {zap && (
          <Revela>
            <p className="faq-pe">
              Ficou com outra dúvida?{' '}
              <a href={zap} target="_blank" rel="noreferrer">Pergunte no WhatsApp</a>.
            </p>
          </Revela>
        )}
      </div>
    </section>
  );
}

/**
 * O horário de funcionamento, no contato.
 *
 * Vem da jornada da equipe, calculado no servidor (`lib/horarios.js`) — não é
 * um campo que a empresa preenche e esquece de atualizar. Dias de mesma faixa
 * viram uma linha só ("seg a sex · 09:00 às 19:00"), como um negócio escreve
 * na porta.
 */
function Horarios({ horarios = [] }) {
  const linhas = useMemo(() => agruparDias(horarios), [horarios]);
  if (!linhas.length) return null;
  return (
    <div className="horarios">
      <h3><Clock size={15} /> Horário de atendimento</h3>
      <dl>
        {linhas.map(l => (
          <div key={l.dias}>
            <dt>{l.dias}</dt>
            <dd>{l.abre} às {l.fecha}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const NOME_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Dias seguidos com a mesma faixa viram uma linha: "seg a sex". */
function agruparDias(horarios) {
  const linhas = [];
  for (const h of horarios) {
    const ultima = linhas[linhas.length - 1];
    // Só junta dia consecutivo: seg e qua com o mesmo horário são duas linhas,
    // senão "seg a qua" prometeria terça.
    if (ultima && ultima.abre === h.abre && ultima.fecha === h.fecha && ultima.ate === h.dia - 1) {
      ultima.ate = h.dia;
    } else {
      linhas.push({ de: h.dia, ate: h.dia, abre: h.abre, fecha: h.fecha });
    }
  }
  return linhas.map(l => ({
    ...l,
    dias: l.de === l.ate ? NOME_DIA[l.de]
      : l.ate === l.de + 1 ? `${NOME_DIA[l.de]} e ${NOME_DIA[l.ate]}`
      : `${NOME_DIA[l.de]} a ${NOME_DIA[l.ate]}`,
  }));
}

function Logo({ marca, nome, tamanho }) {
  const estilo = tamanho ? { width: tamanho, height: tamanho, borderWidth: 2 } : undefined;
  return (
    <div className="logo" style={estilo}>
      {/* `alt=""`: este logo fica logo acima do `<h1>` com o nome do negócio.
          O leitor de tela já vai lê-lo — repetir aqui não acrescenta nada. */}
      {marca?.logo
        ? <img src={marca.logo} alt="" />
        : <span className="logo-letra" style={tamanho ? { fontSize: tamanho * 0.5 } : undefined}>
            {(nome || '?').trim()[0]?.toUpperCase()}
          </span>}
    </div>
  );
}

/**
 * Categorias na home.
 *
 * Tocar numa categoria abre a janela de agendamento já na lista dela. Antes a
 * home abria os serviços do grupo, e a janela pedia o serviço de novo logo
 * depois — a mesma lista, duas vezes, com um toque a mais no meio.
 */
function Categorias({ categorias, negocio, aoAbrir }) {
  return (
    <Grade>
      {categorias.map(({ nome, itens }, i) => {
        const capa = itens.find(s => s.foto)?.foto;
        return (
          <Revela key={nome} className={`atraso-${Math.min(i, 5)}`}>
            <article className="svc-item">
              <button className="svc-circulo" onClick={() => aoAbrir(nome)}
                      aria-label={`Agendar em ${nome}, ${itens.length} opções`}>
                {/* `alt=""`: a imagem está DENTRO do botão, que já se anuncia
                    pelo `aria-label`. Descrever aqui faria o leitor de tela
                    ler a categoria duas vezes antes de dizer que é um botão. */}
                {capa
                  ? <img src={capa} alt="" loading="lazy" />
                  : <span className="svc-inicial">{nome?.[0]?.toUpperCase()}</span>}
              </button>
              <h4 className="svc-nome">{nome}</h4>
              <p className="svc-meta">
                <span className="svc-dur">{itens.length} {itens.length === 1 ? 'opção' : 'opções'}</span>
              </p>
              <button className="b b-p b-peq svc-btn svc-btn-cat" onClick={() => aoAbrir(nome)}>
                Ver opções <ChevronRight size={15} />
              </button>
              {/* Aqui a dúvida cita a categoria: é o que está na tela, e quem
                  está em dúvida é justamente quem ainda não escolheu o serviço. */}
              <PerguntarSobre negocio={negocio} servico={{ nome }} />
            </article>
          </Revela>
        );
      })}
    </Grade>
  );
}

/**
 * Serviços em grade, cada um com a foto redonda.
 *
 * A foto vira o que a pessoa reconhece primeiro — "unhas", "sobrancelha" — bem
 * mais rápido que ler uma lista de nomes. Sem foto, entra a inicial sobre a cor
 * da marca, para o círculo não ficar vazio e a grade não desalinhar.
 */
function Servicos({ itens, exibir, textos, negocio, aoAgendar }) {
  return (
    <Grade>
      {itens.map((s, i) => (
        <Revela key={s.id} className={`atraso-${Math.min(i, 5)}`}>
          <article className="svc-item">
            {/* Mesma regra das categorias: a imagem mora dentro do botão, que
                já diz "Agendar <serviço>". Ver `alt` em Clinica.jsx. */}
            <button className="svc-circulo" onClick={() => aoAgendar(s.id)}
                    aria-label={`Agendar ${s.nome}`}>
              {s.foto
                ? <img src={s.foto} alt="" loading="lazy" />
                : <span className="svc-inicial">{s.nome.trim()[0].toUpperCase()}</span>}
            </button>
            <h4 className="svc-nome" title={s.descricao || undefined}>{s.nome}</h4>
            {(s.preco != null || exibir?.duracao) && (
              <p className="svc-meta">
                {s.preco != null
                  ? <span className="svc-preco">{brl(s.preco)}</span>
                  : <span className="sob-consulta">Sob consulta</span>}
                {exibir?.duracao && <span className="svc-dur">{duracaoTexto(s.duracao)}</span>}
              </p>
            )}
            <button className="b b-p b-peq svc-btn" onClick={() => aoAgendar(s.id)}>
              <Calendar size={15} /> {textos?.botaoAgendar || 'Agendar'}
            </button>
            <PerguntarSobre negocio={negocio} servico={s} />
          </article>
        </Revela>
      ))}
    </Grade>
  );
}

/**
 * O combo principal, em destaque — campo de cor cheio da marca, preço em
 * escala grande. É a promoção que a empresa mais quer empurrar agora, então
 * ganha o mesmo peso visual que o cabeçalho: não é mais um cartão na grade,
 * é a segunda coisa que a página afirma depois do próprio nome.
 */
function Destaque({ combo: c, exibir, aoAgendar }) {
  return (
    <Revela>
      <article className="destaque">
        <div>
          <span className="destaque-selo"><Sparkles size={13} /> Promoção</span>
          <h2 className="destaque-nome">{c.nome}</h2>
          <p className="destaque-itens">{c.servicos.map(s => s.nome).join(' + ')}</p>
          {c.descricao && <p className="destaque-desc">{c.descricao}</p>}
          <button className="b destaque-btn" onClick={() => aoAgendar(c.id)}>
            <Calendar size={18} /> Aproveitar
          </button>
        </div>
        <div className="destaque-preco">
          <span className="destaque-cheio">{brl(c.precoCheio)}</span>
          <strong className="destaque-valor">{brl(c.preco)}</strong>
          <span className="destaque-economia">economize {brl(c.economia)}</span>
          {exibir?.duracao && <span className="destaque-dur">{duracaoTexto(c.duracao)} no total</span>}
        </div>
      </article>
    </Revela>
  );
}

/**
 * Promoções: o pacote e, ao lado, o que ele deixa de custar.
 *
 * O preço cheio riscado e o "economize" existem porque combo sem vantagem
 * visível vira só mais um item da lista, e ninguém percebe que é oferta. Os
 * dois números vêm calculados do servidor — a empresa não digita economia.
 *
 * Cartão em bloco, e não círculo como os serviços: promoção precisa carregar
 * o que está dentro dela, e nome de dois serviços não cabe embaixo de uma foto
 * redonda.
 */
function Promocoes({ itens, exibir, aoAgendar }) {
  return (
    <div className="promos">
      {itens.map((c, i) => (
        <Revela key={c.id} className={`atraso-${Math.min(i, 5)}`}>
          <article className="promo">
            <span className="promo-selo"><Sparkles size={13} /> Promoção</span>
            {/* O cartão da promoção não é um botão inteiro (o "Aproveitar" é
                um botão à parte), então a foto é conteúdo e ganha descrição. */}
            {c.foto && <img className="promo-foto" src={c.foto} alt={c.nome} loading="lazy" />}
            <h4 className="promo-nome">{c.nome}</h4>
            <p className="promo-itens">{c.servicos.map(s => s.nome).join(' + ')}</p>
            {c.descricao && <p className="promo-desc">{c.descricao}</p>}

            <div className="promo-precos">
              <span className="promo-cheio">{brl(c.precoCheio)}</span>
              <strong className="promo-preco">{brl(c.preco)}</strong>
            </div>
            <p className="promo-economia">economize {brl(c.economia)}</p>
            {exibir?.duracao && <p className="promo-dur">{duracaoTexto(c.duracao)} no total</p>}

            <button className="b b-p b-peq promo-btn" onClick={() => aoAgendar(c.id)}>
              <Calendar size={15} /> Aproveitar
            </button>
          </article>
        </Revela>
      ))}
    </div>
  );
}

function Rodape({ dados, negocio, textos, cheio }) {
  const NOMES_PAG = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' };
  return (
    <footer className={'bloco rodape' + (cheio ? ' bloco-cheio' : '')}>
      <div className="env">
        <h2 className="bloco-titulo pequeno">Contato</h2>
        <div className="rodape-links">
          <Lugares dados={dados} className="rodape-link" tamanho={17} />
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

        <Horarios horarios={negocio.horarios} />

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
