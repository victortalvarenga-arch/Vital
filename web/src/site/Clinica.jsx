import { useEffect, useState } from 'react';
import {
  ArrowDown, ArrowRight, Calendar, ChevronLeft, ChevronRight, Clock, Instagram,
  MapPin, MessageCircle, ShieldCheck, Sparkles, Star,
} from 'lucide-react';
import { Revela } from './App.jsx';
import { soDigitos } from './datas.js';

/**
 * Tudo que só o modelo Clínica tem: o cabeçalho de duas colunas e as seções
 * extras (equipe, antes/depois, avaliações, agende, Instagram, mapa). Os
 * outros três modelos não pediram nenhuma delas, então ficam neste arquivo à
 * parte em vez de inchar App.jsx com algo que só um modelo usa — App.jsx
 * fica só com o que os quatro compartilham.
 *
 * A referência visual atual é um site de exemplo que a própria cliente
 * trouxe (creme, verde, dourado, títulos com uma palavra em itálico
 * serifado). Veio o visual; não veio o conteúdo inventado que ele tinha —
 * depoimentos com nome, "nota 5,0", "+8 anos". Nenhuma seção aqui inventa
 * nada: equipe e mapa usam dado real, antes/depois só entra com foto
 * autorizada, avaliações ficam num estado vazio honesto até existir uma de
 * verdade. Ver PRODUCT.md, "Evidence on Hand".
 */

/**
 * O título de seção da Clínica: fio dourado + rótulo em caixa-alta, e por
 * baixo o título grande com a palavra de destaque em <em> (itálico
 * serifado, via CSS). Os filhos já vêm com o <em> no lugar certo — o gesto
 * é editorial, não mecânico, então cada seção escolhe a própria palavra.
 */
export function TituloClinica({ olho, children }) {
  return (
    <Revela>
      {olho && <p className="olho">{olho}</p>}
      <h2 className="bloco-titulo">{children}</h2>
    </Revela>
  );
}

/* ── cabeçalho ──
   Faixa na cor escura da empresa, texto à esquerda, retrato em arco à
   direita. O nome da empresa é o título, com a última palavra em itálico —
   é como o título ganha a palavra de destaque sem inventar slogan nenhum:
   o dado é o nome, o gesto é do modelo. */

export function HeroClinica({ negocio, marca, textos, aoAgendar }) {
  const palavras = (negocio.nome || '').trim().split(/\s+/);
  const ultima = palavras.length > 1 ? palavras.pop() : null;
  return (
    <div className="identidade identidade-sem-capa">
      {/* Dois anéis dourados atrás do retrato, como na referência — só
          desenho, fora do fluxo. */}
      <span className="clinica-anel" style={{ width: 320, height: 320, right: -80, top: 40 }} aria-hidden="true" />
      <span className="clinica-anel" style={{ width: 224, height: 224, right: -24, top: 96 }} aria-hidden="true" />
      <div className="env-largo clinica-hero">
        <div className="clinica-hero-txt">
          {negocio.slogan && <p className="olho">{negocio.slogan}</p>}
          <h1>
            {palavras.join(' ')}{ultima && <> <em>{ultima}</em></>}
          </h1>
          {negocio.sobre && <p className="slogan">{primeiraFrase(negocio.sobre)}</p>}
          <div className="chamada">
            <button className="b clinica-cta-ouro" onClick={() => aoAgendar(null)}>
              {textos?.chamada || 'Agende seu horário'} <ArrowRight size={15} />
            </button>
            <a className="clinica-cta-link" href="#servicos">
              Conheça os serviços <ArrowDown size={14} />
            </a>
          </div>
          {negocio.endereco && (
            <a className="local"
               href={negocio.mapa || `https://maps.google.com/?q=${encodeURIComponent(negocio.endereco)}`}
               target="_blank" rel="noreferrer">
              <MapPin size={15} /> {negocio.endereco}
            </a>
          )}
        </div>
        <div className="clinica-hero-quadro">
          <CarrosselHero marca={marca} inicial={(negocio.nome || '?').trim()[0]?.toUpperCase()} />
          {/* O selo diz uma coisa que é verdade do produto, não um slogan:
              aqui se marca hora de verdade, sem cadastro nem senha. */}
          <div className="clinica-hero-selo">
            <span className="clinica-hero-selo-ico"><Sparkles size={16} /></span>
            <span><b>Hora marcada online</b><span>sem cadastro, sem senha</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A primeira frase de um texto — o que cabe embaixo do título sem repetir a
    seção "Sobre" inteira. */
function primeiraFrase(texto) {
  const m = /^(.+?[.!?])(\s|$)/.exec(texto.trim());
  return m ? m[1] : texto;
}

/**
 * O retrato do cabeçalho — uma imagem só (ou a inicial) hoje, mas já passa
 * sozinho para mais de uma quando `marca.capas` existir. Ainda não há tela no
 * painel para cadastrar mais de uma capa — só a `capa` única de
 * Configurações → Site da cliente.
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

/* ── equipe ── */

export function SecaoEquipe({ profissionais }) {
  if (!profissionais?.length) return null;
  return (
    <section id="equipe" className="bloco bloco-cheio">
      <div className="env-largo">
        <TituloClinica olho="Equipe">Quem cuida de <em>você.</em></TituloClinica>
        <div className="equipe-grade">
          {profissionais.map((p, i) => (
            <Revela key={p.id} className={`atraso-${Math.min(i, 5)}`}>
              <article className="equipe-item">
                {/* A cor da pessoa vira o anel, não o fundo: sobre a faixa
                    escura, um fundo tingido com cor escura (o verde-musgo da
                    Laura, por exemplo) sumia junto com a inicial. */}
                <span className="equipe-foto" style={p.cor ? { borderColor: p.cor } : undefined}>
                  {p.nome.trim()[0].toUpperCase()}
                </span>
                <h4>{p.nome}</h4>
                {p.funcao && <p>{p.funcao}</p>}
              </article>
            </Revela>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── antes e depois ──
   O controle é um <input type="range"> de verdade, não um enfeite — dá pra
   arrastar com teclado, mouse ou dedo.

   Sem caso cadastrado, os dois lados são só um rótulo e uma cor lavada: nada
   aqui pode parecer um caso real que não existe. Com caso, são as fotos que a
   empresa cadastrou — sempre de gente de verdade, sempre com autorização de
   imagem, e é a empresa que responde por isso. */

export function SecaoAntesDepois({ casos = [] }) {
  const [pos, setPos] = useState(50);
  const [i, setI] = useState(0);
  const caso = casos[i];

  return (
    <section className="bloco bloco-marca">
      <div className="env-largo">
        <Revela>
          <div className="secao-cab">
            <div>
              <p className="olho">Resultados</p>
              <h2 className="bloco-titulo">Pequenas mudanças, <em>grandes sensações.</em></h2>
            </div>
            {!caso && <span className="em-breve">Em breve</span>}
          </div>
        </Revela>

        {casos.length > 1 && (
          <Revela>
            <div className="comparar-casos">
              {casos.map((c, n) => (
                <button key={n} type="button"
                        className={'comparar-caso' + (n === i ? ' on' : '')}
                        onClick={() => { setI(n); setPos(50); }}>
                  {c.titulo || `Caso ${n + 1}`}
                </button>
              ))}
            </div>
          </Revela>
        )}

        <Revela>
          <div className="comparar" style={{ '--pos': `${pos}%` }}>
            <div className="comparar-lado comparar-antes">
              {caso ? <img src={caso.antes} alt="Antes do atendimento" /> : <span>Antes</span>}
              {caso && <span className="comparar-tag">Antes</span>}
            </div>
            <div className="comparar-lado comparar-depois">
              {caso ? <img src={caso.depois} alt="Depois do atendimento" /> : <span>Depois</span>}
              {caso && <span className="comparar-tag comparar-tag-d">Depois</span>}
            </div>

            {/* A linha divisória e a alça são só desenho — `pointer-events:
                none` deixa o clique atravessar até o input, que é quem de fato
                move. Sem isso, arrastar pegando na bolinha (o gesto mais
                óbvio) seria o único que não funcionaria. */}
            <div className="comparar-alca" aria-hidden="true">
              <span className="comparar-bolinha">
                <ChevronLeft size={16} strokeWidth={2.5} />
                <ChevronRight size={16} strokeWidth={2.5} />
              </span>
            </div>

            {/* O <input type="range"> continua sendo o controle de verdade,
                agora esticado por cima da imagem inteira e invisível: o dedo
                arrasta em qualquer ponto, o teclado anda com as setas e o
                leitor de tela anuncia um slider. Fazer isso com pointerdown
                à mão custaria as três coisas. */}
            <input type="range" min={0} max={100} value={pos}
                   onChange={e => setPos(+e.target.value)}
                   className="comparar-controle" aria-label="Arrastar para comparar antes e depois" />
          </div>
        </Revela>

        <p className="comparar-legenda">
          {caso
            ? `${caso.titulo ? caso.titulo + '. ' : ''}Resultado real, publicado com autorização da cliente. Cada pele responde de um jeito.`
            : 'Fotos reais de clientes, sempre com autorização, entram aqui assim que o primeiro caso estiver pronto para mostrar.'}
        </p>
      </div>
    </section>
  );
}

/* ── avaliações ──
   Sem carrossel de mentira sobre zero avaliação real. */

export function SecaoAvaliacoes() {
  return (
    <section id="avaliacoes" className="bloco">
      <div className="env-largo">
        <TituloClinica olho="Avaliações">Cuidado que <em>fica na memória.</em></TituloClinica>
        <Revela>
          <div className="vazio-cartao">
            <Star size={22} strokeWidth={1.5} aria-hidden="true" />
            <p>As avaliações de clientes aparecem aqui assim que o negócio começar a receber.</p>
          </div>
        </Revela>
      </div>
    </section>
  );
}

/* ── agende ──
   A faixa bege da referência era um formulário que mandava pro WhatsApp. A
   nossa abre o agendamento de verdade — horário, profissional, adicionais,
   ficha — que é o produto. Os três itens da lista são fatos do sistema, não
   promessas: hora marcada, confirmação por WhatsApp, sem cadastro. */

export function SecaoAgende({ textos, aoAgendar }) {
  return (
    <section id="agendamento" className="bloco clinica-agende">
      <div className="env-largo clinica-agende-grade">
        <div>
          <TituloClinica olho="Agende">Seu cuidado <em>começa aqui.</em></TituloClinica>
          <Revela>
            <p>Escolha o serviço, quem atende e o horário — em menos de um minuto, direto daqui.</p>
            <ul className="clinica-agende-lista">
              <li><Clock size={17} /> Atendimento com hora marcada</li>
              <li><MessageCircle size={17} /> Confirmação pelo WhatsApp</li>
              <li><ShieldCheck size={17} /> Sem cadastro, sem senha — só o seu número</li>
            </ul>
          </Revela>
        </div>
        <Revela>
          <div className="clinica-agende-cx">
            <p className="olho" style={{ marginBottom: 0 }}>Primeiro passo</p>
            <h3>Vamos encontrar o seu horário</h3>
            <p>Você vê os horários livres na hora e escolhe o que encaixa no seu dia.</p>
            <button className="b b-p" onClick={() => aoAgendar(null)}>
              <Calendar size={16} /> {textos?.chamada || 'Agende seu horário'}
            </button>
          </div>
        </Revela>
      </div>
    </section>
  );
}

/* ── instagram ──
   Link de verdade para o perfil real — nunca um grid fingindo mostrar posts
   que o site não tem acesso a carregar. */

export function SecaoInstagram({ negocio }) {
  if (!negocio.instagram) return null;
  const arroba = negocio.instagram.replace('@', '');
  return (
    <section className="bloco bloco-marca">
      <div className="env-largo insta-painel">
        <Instagram size={28} strokeWidth={1.6} aria-hidden="true" />
        <div className="insta-txt">
          <h2 className="bloco-titulo" style={{ marginBottom: 4, fontSize: 'var(--t-destaque)' }}>@{arroba}</h2>
          <p>Acompanhe o dia a dia no Instagram.</p>
        </div>
        <a className="b b-p" href={`https://instagram.com/${arroba}`} target="_blank" rel="noreferrer">
          Seguir no Instagram
        </a>
      </div>
    </section>
  );
}

/* ── mapa ──
   Embed do Google Maps sem chave de API — só o endereço da própria empresa,
   nunca uma localização inventada. */

export function SecaoMapa({ negocio }) {
  if (!negocio.endereco) return null;
  return (
    <section id="contato" className="bloco">
      <div className="env-largo">
        <TituloClinica olho="Onde estamos">Um lugar para <em>você chegar.</em></TituloClinica>
        <Revela>
          <div className="mapa-caixa clinica-mapa">
            <iframe
              title="Localização no mapa"
              src={`https://www.google.com/maps?q=${encodeURIComponent(negocio.endereco)}&output=embed`}
              loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          </div>
        </Revela>
      </div>
    </section>
  );
}

/* ── WhatsApp flutuante ──
   O botão dourado no canto, como na referência. Some quando a empresa não
   tem WhatsApp cadastrado — botão que não leva a lugar nenhum é pior que
   nenhum. */

export function BotaoWhatsApp({ negocio }) {
  if (!negocio.whatsapp) return null;
  return (
    <a className="clinica-fab" href={`https://wa.me/55${soDigitos(negocio.whatsapp)}`}
       target="_blank" rel="noreferrer" aria-label="Falar no WhatsApp">
      <MessageCircle size={23} />
    </a>
  );
}
