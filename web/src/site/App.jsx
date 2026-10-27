import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar, Clock, Instagram, MapPin, MessageCircle,
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
import { tituloProprio, ComItalico } from './titulos.jsx';
import Privacidade from './Privacidade.jsx';
import { quandoVale } from '../shared/promocao.js';
import Essencial, { RodapeEssencial } from './modelos/Essencial.jsx';
import Galeria, { RodapeGaleria } from './modelos/Galeria.jsx';
import Serena, { RodapeSerena } from './modelos/Serena.jsx';
import {
  HeroClinica, TituloClinica, CartoesClinica, SecaoEquipe, SecaoAntesDepois,
  SecaoAvaliacoes, SecaoAgende, SecaoInstagram, SecaoMapa, BotaoWhatsApp,
} from './Clinica.jsx';

export default function App() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [agendando, setAgendando] = useState(null);   // { servicoId } | null
  // A política de privacidade é uma "página" no mesmo endereço, em
  // `#privacidade`: o site é um arquivo só por empresa, e o link precisa poder
  // ser mandado e aberto direto.
  const [privacidade, setPrivacidade] = useState(() => location.hash === '#privacidade');

  useEffect(() => {
    const aoTrocar = () => setPrivacidade(location.hash === '#privacidade');
    addEventListener('hashchange', aoTrocar);
    return () => removeEventListener('hashchange', aoTrocar);
  }, []);

  // Abrir ou fechar a política volta ao topo. Só nessa troca: as seções do
  // modelo Clínica também são âncoras, e voltar ao topo a cada uma desfaria
  // o pulo que o link pediu.
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    window.scrollTo(0, 0);
  }, [privacidade]);

  useEffect(() => {
    api.vitrine()
      .then(d => {
        // ?template=quadro por cima da config salva — pré-visualizar um
        // modelo sem precisar gravar nada, do painel ou de um link só seu.
        // Entra nos dados, não só no tema: cada modelo tem a própria
        // estrutura, e trocar só a pele punha as cores de um no esqueleto do
        // outro.
        const doLink = new URLSearchParams(location.search).get('template');
        if (doLink) d = { ...d, marca: { ...d.marca, template: doLink } };
        setDados(d);
        aplicarTema(d.marca);
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

  if (privacidade) return <Privacidade negocio={dados.negocio} />;

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
          {/* Nada de "Minha conta": o login da cliente está em "Ideias
              guardadas" no ROADMAP, e botão que não leva a lugar nenhum é
              pior que a ausência. Pelo mesmo motivo, sem nada para agendar
              não há botão de agendar. */}
          {aoAgendar && (
            <button className="b b-p b-peq" onClick={() => aoAgendar(null)}>
              <Calendar size={15} /> Agendar
            </button>
          )}
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

/** O modelo de cada `marca.template`, e o rodapé dele. A Clínica fica fora: é montada em Home. */
const MODELOS = {
  bandeja: [Essencial, RodapeEssencial],
  quadro: [Galeria, RodapeGaleria],
  caderneta: [Serena, RodapeSerena],
};

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

  // Empresa recém-cadastrada já tem endereço no ar antes de ter catálogo. Sem
  // serviço nem promoção, todo botão de agendar abriria uma janela vazia: some
  // o botão, e a página diz que está chegando em vez de parecer quebrada.
  const temOQueAgendar = servicos.length > 0 || combos.length > 0;
  const agendar = temOQueAgendar ? aoAgendar : null;

  // Instagram e mapa existem mesmo sem conteúdo próprio (o Instagram mostra o
  // perfil; o mapa, o endereço), por isso a chave da seção é conferida aqui
  // — o resto, equipe inclusive, chega da vitrine já vazio quando a seção
  // está desligada.
  const ligada = chave => exibir?.[chave] !== false;
  const T = chave => tituloProprio(dados, chave);

  // Cada modelo é uma composição inteira (modelos/), não uma pele sobre o
  // mesmo esqueleto: os três antigos dividiam a estrutura e só trocavam cor e
  // textura, e era isso que os fazia parecer o mesmo site quebrado. A
  // Clínica continua montada aqui embaixo, como a cliente aprovou.
  if (marca?.template !== 'clinica') {
    const [Modelo, RodapeModelo] = MODELOS[marca?.template] || MODELOS.bandeja;
    // Só seção que renderizou entra na barra: link para âncora que não
    // existe é clique para lugar nenhum.
    const secoes = [
      servicos.length > 0 && ['Serviços', 'servicos'],
      negocio.sobre && ['Sobre', 'sobre'],
      dados.equipe?.length > 0 && ['Equipe', 'equipe'],
      marca?.template === 'quadro' && servicos.length > 0 && ['Preços', 'precos'],
      dados.faq?.length > 0 && ['Dúvidas', 'perguntas'],
      ligada('mapa') && lugares(dados).length > 0 && ['Contato', 'contato'],
    ].filter(Boolean);
    return (
      <main>
        {/* Só a Galeria tem foto de ponta a ponta sob a barra; nos outros
            dois o topo é claro, e a barra transparente de texto branco
            sumiria nele. */}
        <BarraTopo negocio={negocio} marca={marca} aoAgendar={agendar}
                   temCapa={marca?.template === 'quadro'} secoes={secoes} />
        <Modelo dados={dados} servicos={servicos} categorias={categorias} combos={combos}
                agendar={agendar} aoAgendar={aoAgendar} aoAgendarCombo={aoAgendarCombo}
                ligada={ligada} temOQueAgendar={temOQueAgendar} />
        <RodapeModelo dados={dados} negocio={negocio} agendar={agendar} mostrarPagamento={temOQueAgendar} />
      </main>
    );
  }

  const secoesClinica = [
    ['Serviços', 'servicos'],
    ...(dados.equipe?.length ? [['Equipe', 'equipe']] : []),
    ...(dados.avaliacoes ? [['Avaliações', 'avaliacoes']] : []),
    ...(ligada('instagram') && negocio.instagram ? [['Instagram', 'instagram']] : []),
    ...(ligada('mapa') && lugares(dados).length ? [['Contato', 'contato']] : []),
  ];

  return (
    <main>
      <BarraTopo negocio={negocio} marca={marca} aoAgendar={agendar}
                 temCapa={false} secoes={secoesClinica} />

      <HeroClinica dados={dados} negocio={negocio} marca={marca} textos={textos} aoAgendar={agendar} />

      {negocio.sobre && (
        <section id="sobre" className="bloco clinica-sobre">
          <div className="env">
            <Revela>
              <p className="olho">{T('sobre') || 'Sobre'}</p>
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
            {/* A Clínica abre as promoções sem título; com um escrito pela
                empresa, ele entra aqui em cima. */}
            {T('promocoes') && <TituloClinica olho="Promoções"><ComItalico texto={T('promocoes')} /></TituloClinica>}
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
          <TituloClinica olho="Serviços">{T('servicos') ? <ComItalico texto={T('servicos')} /> : <>Escolha o seu <em>momento.</em></>}</TituloClinica>
          {servicos.length === 0 && (
            <p className="vazio">
              {temOQueAgendar
                ? 'Por enquanto, só as promoções acima.'
                : 'Em breve: os serviços e os horários para agendar aparecem aqui.'}
            </p>
          )}
          {/* Cartões com foto larga (pedido da cliente, a partir da
              referência), respeitando "separar por categoria". */}
          <CartoesClinica servicos={servicos} categorias={categorias} exibir={exibir}
                          negocio={negocio} aoAgendar={aoAgendar} aoAbrir={aoAbrirCategoria} />
        </div>
      </section>

      <SecaoEquipe equipe={dados.equipe} titulo={T('equipe')} />
      {/* Sem caso autorizado a seção some, como as perguntas: a empresa tem
          onde cadastrar (painel → Site da cliente), e "Em breve" para sempre
          fazia o site parecer inacabado. */}
      {dados.antesDepois?.length > 0 && <SecaoAntesDepois casos={dados.antesDepois} titulo={T('antesDepois')} />}
      {/* Mesma regra do antes e depois: sem avaliação vinda da conta
          conectada, a seção some em vez de prometer "em breve". */}
      {dados.avaliacoes && <SecaoAvaliacoes avaliacoes={dados.avaliacoes} titulo={T('avaliacoes')} />}
      {agendar && <SecaoAgende textos={textos} aoAgendar={agendar} titulo={T('passos')} />}
      {ligada('instagram') && <SecaoInstagram negocio={negocio} marca={marca} posts={dados.instagramPosts} titulo={T('instagram')} />}

      <Perguntas faq={dados.faq} negocio={negocio} titulo={T('perguntas')} />

      {ligada('mapa') && <SecaoMapa dados={dados} titulo={T('mapa')} />}

      <Rodape dados={dados} negocio={negocio} textos={textos} mostrarPagamento={temOQueAgendar} />
      <BotaoWhatsApp negocio={negocio} />
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
function Perguntas({ faq = [], negocio, titulo }) {
  if (!faq.length) return null;
  const zap = linkGeral(negocio, 'Olá! Vim pelo site e fiquei com uma dúvida.');
  return (
    <section id="perguntas" className="bloco">
      <div className="env">
        <TituloClinica olho="Dúvidas">{titulo ? <ComItalico texto={titulo} /> : <>Perguntas que a gente <em>sempre ouve.</em></>}</TituloClinica>

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
export function Horarios({ horarios = [] }) {
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
          {quandoVale(c) && <span className="destaque-quando">{quandoVale(c)}</span>}
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
            {/* A regra de quando vale, dita antes do clique: descobrir no
                calendário que só há terças é descobrir tarde. */}
            {quandoVale(c) && <p className="promo-quando">{quandoVale(c)}</p>}

            <button className="b b-p b-peq promo-btn" onClick={() => aoAgendar(c.id)}>
              <Calendar size={15} /> Aproveitar
            </button>
          </article>
        </Revela>
      ))}
    </div>
  );
}

function Rodape({ dados, negocio, textos, mostrarPagamento }) {
  const NOMES_PAG = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' };
  // "Contato" sem nenhum contato embaixo era o rodapé de toda empresa nova:
  // o título e, sozinhos, os chips de pagamento.
  const temContato = lugares(dados).length > 0 || negocio.whatsapp || negocio.fone
    || negocio.instagram || negocio.horarios?.length > 0;
  return (
    <footer className="bloco rodape bloco-cheio">
      <div className="env">
        {temContato && <h2 className="bloco-titulo pequeno">Contato</h2>}
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

        {mostrarPagamento && negocio.formasPagamento?.length > 0 && (
          <div className="pagamentos">
            {negocio.formasPagamento.map(f => <span key={f} className="pag">{NOMES_PAG[f] || f}</span>)}
          </div>
        )}

        <p className="assinatura">{textos?.rodape || negocio.nome}</p>
        <a className="rodape-privacidade" href="#privacidade">Política de privacidade</a>
      </div>
    </footer>
  );
}
