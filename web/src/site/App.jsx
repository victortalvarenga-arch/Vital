import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar, ChevronRight, Instagram, MapPin, MessageCircle,
  Phone, Sparkles, TriangleAlert,
} from 'lucide-react';
import * as api from '../shared/publico.js';
import { aplicarTema } from './tema.js';
import { brl, duracaoTexto, soDigitos } from './datas.js';
import Agendar from './Agendar.jsx';
import Grade from './Grade.jsx';
import { SecaoEquipe, SecaoAntesDepois, SecaoAvaliacoes, SecaoInstagram, SecaoMapa } from './Clinica.jsx';

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
        document.title = d.negocio.nome;
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
function BarraTopo({ negocio, marca, aoAgendar, temCapa }) {
  const [rolou, setRolou] = useState(false);
  const firme = !temCapa || rolou;

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
          {marca?.logo && <img className="barra-logo" src={marca.logo} alt="" />}
          <span className="barra-nome">{negocio.nome}</span>
        </div>
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

/* ── revelar ao rolar ──────────────────────────────────────────────
   Discreto de propósito: a página existe para agendar rápido, não para
   impressionar. Quem pediu menos movimento no sistema não vê nada. */
export function useRevelar() {
  const ref = useRef(null);
  useEffect(() => {
    const alvo = ref.current;
    if (!alvo) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      alvo.classList.add('visivel');
      return;
    }
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { alvo.classList.add('visivel'); obs.disconnect(); }
    }, { threshold: 0.12 });
    obs.observe(alvo);
    return () => obs.disconnect();
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

  // Clínica é o único modelo com um cabeçalho de duas colunas — o resto do
  // esqueleto (barra, .capa como faixa solta, .identidade empilhada) é
  // compartilhado pelos outros três de propósito. Uma estrutura por modelo
  // só se justifica quando o próprio modelo pede uma composição diferente,
  // não uma variação de cor — ver "Do build new site markup..." no
  // DESIGN.md. Referência: inspiraestetica.com.br, texto de um lado, imagem
  // grande do outro.
  const ehClinica = marca?.template === 'clinica';
  // A barra é fixa e, sem uma faixa de capa embaixo dela pra absorver a
  // sobreposição, ela cobre o topo do que vier em seguida — cortava a foto
  // ou a inicial da Clínica, e cortava o nome de qualquer empresa sem capa
  // nos outros três modelos. Só a faixa .capa clássica (260px, bem mais alta
  // que a barra) tem folga o bastante para a barra flutuar por cima sem
  // esconder nada; nos outros casos, .identidade precisa da própria folga.
  const temFaixaDeCapa = !ehClinica && !!marca?.capa;

  return (
    <main>
      <BarraTopo negocio={negocio} marca={marca} aoAgendar={aoAgendar}
                 temCapa={temFaixaDeCapa} />

      {ehClinica ? (
        <HeroClinica negocio={negocio} marca={marca} textos={textos} aoAgendar={aoAgendar} />
      ) : (
        <>
          {/* A foto de capa, quando existe, é uma peça acima do cabeçalho —
              não o cabeçalho em si. Sem foto (o caso de hoje, sem nenhuma
              empresa com imagem enviada), o nome já nasce sobre o fundo
              lavado da marca: nada de mancha de gradiente fingindo ser
              imagem. */}
          {marca?.capa && (
            <div className="capa">
              <img src={marca.capa} alt="" />
              <div className="capa-veu" aria-hidden="true" />
            </div>
          )}

          <div className={'identidade' + (!temFaixaDeCapa ? ' identidade-sem-capa' : '')}>
            <div className="env identidade-in">
              <Logo marca={marca} nome={negocio.nome} />
              <h1>{negocio.nome}</h1>
              {negocio.slogan && <p className="slogan">{negocio.slogan}</p>}
              {negocio.endereco && (
                <a className="local"
                   href={negocio.mapa || `https://maps.google.com/?q=${encodeURIComponent(negocio.endereco)}`}
                   target="_blank" rel="noreferrer">
                  <MapPin size={15} /> {negocio.endereco}
                </a>
              )}
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
        <section className="bloco">
          <div className="env">
            <Revela><p className="sobre">{negocio.sobre}</p></Revela>
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
      <section className="bloco bloco-marca">
        <div className="env-largo">
          <Revela><h2 className="bloco-titulo">Serviços</h2></Revela>
          {servicos.length === 0 && <p className="vazio">Nenhum serviço disponível no momento.</p>}
          {exibir?.categorias && categorias.length > 1
            ? <Categorias categorias={categorias} aoAbrir={aoAbrirCategoria} />
            : <Servicos itens={servicos} exibir={exibir} textos={textos} aoAgendar={aoAgendar} />}
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
          <SecaoInstagram negocio={negocio} />
          <SecaoMapa negocio={negocio} />
        </>
      )}

      <Rodape negocio={negocio} textos={textos} cheio={ehClinica} />
    </main>
  );
}

/**
 * O cabeçalho do modelo Clínica: texto de um lado, imagem grande do outro —
 * a composição do próprio inspiraestetica.com.br, não uma variação de cor
 * do cabeçalho dos outros três modelos.
 *
 * Sem `marca.capa` (nenhuma empresa de exemplo tem foto hoje), o painel
 * visual não finge ser uma foto — vira a marca da empresa em destaque, o
 * mesmo círculo-com-inicial que o site já usa em outros lugares quando falta
 * imagem, só que grande. Assim que a empresa subir uma capa, a foto real
 * ocupa o mesmo espaço sem mudar mais nada.
 */
function HeroClinica({ negocio, marca, textos, aoAgendar }) {
  return (
    <div className="identidade identidade-sem-capa">
      <div className="env-largo clinica-hero">
        <div className="clinica-hero-txt">
          <h1>{negocio.nome}</h1>
          {negocio.slogan && <p className="slogan">{negocio.slogan}</p>}
          {negocio.endereco && (
            <a className="local"
               href={negocio.mapa || `https://maps.google.com/?q=${encodeURIComponent(negocio.endereco)}`}
               target="_blank" rel="noreferrer">
              <MapPin size={15} /> {negocio.endereco}
            </a>
          )}
          <div className="chamada">
            <button className="b b-p" onClick={() => aoAgendar(null)}>
              <Calendar size={18} /> {textos?.chamada || 'Agende seu horário'}
            </button>
          </div>
        </div>
        <CarrosselHero marca={marca} inicial={(negocio.nome || '?').trim()[0]?.toUpperCase()} />
      </div>
    </div>
  );
}

/**
 * O painel visual do cabeçalho — uma imagem só (ou a inicial) hoje, mas já
 * passa sozinho para mais de uma quando `marca.capas` existir. Ainda não há
 * tela no painel para cadastrar mais de uma capa — só a `capa` única de
 * Configurações → Site da cliente — então isto funciona, mas ninguém
 * consegue alimentar mais de um item nele ainda.
 */
function CarrosselHero({ marca, inicial }) {
  const imagens = marca?.capas?.length ? marca.capas : (marca?.capa ? [marca.capa] : []);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (imagens.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setI(v => (v + 1) % imagens.length), 5000);
    return () => clearInterval(t);
  }, [imagens.length]);

  return (
    <div className="clinica-hero-visual">
      {imagens.length > 0
        ? <img key={i} src={imagens[i]} alt="" />
        : <span className="clinica-hero-marca">{inicial}</span>}
      {imagens.length > 1 && (
        <div className="clinica-hero-pontos">
          {imagens.map((_, idx) => (
            <button key={idx} className={'clinica-ponto' + (idx === i ? ' on' : '')}
                    onClick={() => setI(idx)} aria-label={`Imagem ${idx + 1} de ${imagens.length}`} />
          ))}
        </div>
      )}
    </div>
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

/**
 * Categorias na home.
 *
 * Tocar numa categoria abre a janela de agendamento já na lista dela. Antes a
 * home abria os serviços do grupo, e a janela pedia o serviço de novo logo
 * depois — a mesma lista, duas vezes, com um toque a mais no meio.
 */
function Categorias({ categorias, aoAbrir }) {
  return (
    <Grade>
      {categorias.map(({ nome, itens }, i) => {
        const capa = itens.find(s => s.foto)?.foto;
        return (
          <Revela key={nome} className={`atraso-${Math.min(i, 5)}`}>
            <article className="svc-item">
              <button className="svc-circulo" onClick={() => aoAbrir(nome)}
                      aria-label={`Agendar em ${nome}, ${itens.length} opções`}>
                {capa
                  ? <img src={capa} alt="" loading="lazy" />
                  : <span className="svc-inicial">{nome?.[0]?.toUpperCase()}</span>}
              </button>
              <h4 className="svc-nome">{nome}</h4>
              <p className="svc-meta">
                <span className="svc-dur">{itens.length} {itens.length === 1 ? 'opção' : 'opções'}</span>
              </p>
              <button className="b b-p b-peq svc-btn" onClick={() => aoAbrir(nome)}>
                Ver opções <ChevronRight size={15} />
              </button>
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
function Servicos({ itens, exibir, textos, aoAgendar }) {
  return (
    <Grade>
      {itens.map((s, i) => (
        <Revela key={s.id} className={`atraso-${Math.min(i, 5)}`}>
          <article className="svc-item">
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
            {c.foto && <img className="promo-foto" src={c.foto} alt="" loading="lazy" />}
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

function Rodape({ negocio, textos, cheio }) {
  const NOMES_PAG = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' };
  return (
    <footer className={'bloco rodape' + (cheio ? ' bloco-cheio' : '')}>
      <div className="env">
        <h2 className="bloco-titulo pequeno">Contato</h2>
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
