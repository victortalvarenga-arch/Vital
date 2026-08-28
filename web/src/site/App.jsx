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

export default function App() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [agendando, setAgendando] = useState(null);   // { servicoId } | null

  useEffect(() => {
    api.vitrine()
      .then(d => { setDados(d); aplicarTema(d.marca); document.title = d.negocio.nome; })
      .catch(e => setErro(e.message));
  }, []);

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
 * empresa vai subir. Passado o topo, vira sólida.
 */
function BarraTopo({ negocio, marca, aoAgendar }) {
  const [firme, setFirme] = useState(false);

  useEffect(() => {
    const aoRolar = () => setFirme(window.scrollY > 120);
    aoRolar();
    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => window.removeEventListener('scroll', aoRolar);
  }, []);

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
function useRevelar() {
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

const Revela = ({ children, className = '' }) => {
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

  return (
    <main>
      <BarraTopo negocio={negocio} marca={marca} aoAgendar={aoAgendar} />

      <div className="capa">
        {marca?.capa ? <img src={marca.capa} alt="" /> : <div className="capa-vazia" />}
        <div className="capa-veu" aria-hidden="true" />
      </div>

      <div className="env identidade">
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

      {negocio.sobre && (
        <section className="bloco">
          <div className="env">
            <Revela><p className="sobre">{negocio.sobre}</p></Revela>
          </div>
        </section>
      )}

      {combos.length > 0 && (
        <section className="bloco">
          <div className="env-largo">
            <Revela><h2 className="bloco-titulo">Promoções</h2></Revela>
            <Promocoes itens={combos} exibir={exibir} aoAgendar={aoAgendarCombo} />
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

      <Rodape negocio={negocio} textos={textos} />
    </main>
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

function Rodape({ negocio, textos }) {
  const NOMES_PAG = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' };
  return (
    <footer className="bloco rodape">
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
