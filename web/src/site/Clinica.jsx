import { useEffect, useState } from 'react';
import {
  ArrowDown, ArrowRight, Calendar, ChevronLeft, ChevronRight, Clock, ExternalLink,
  Instagram, MessageCircle, Play, Plus, ShieldCheck, Sparkles, Star,
} from 'lucide-react';
import { Lugares, PerguntarSobre, Revela } from './App.jsx';
import { brl, duracaoTexto, soDigitos } from './datas.js';
import { lugares } from './enderecos.js';

/**
 * Tudo que só o modelo Clínica tem: o cabeçalho de duas colunas, os serviços
 * em cartão e as seções extras (equipe, antes/depois, avaliações, agende,
 * Instagram, mapa). Os outros três modelos não pediram nenhuma delas, então
 * ficam neste arquivo à parte em vez de inchar App.jsx com algo que só um
 * modelo usa — App.jsx fica só com o que os quatro compartilham.
 *
 * A referência visual atual é um site de exemplo que a própria cliente
 * trouxe (creme, verde, dourado, títulos com uma palavra em itálico
 * serifado). Veio o visual; não veio o conteúdo inventado que ele tinha —
 * depoimentos com nome, "nota 5,0", "+8 anos", quadrados de gradiente no
 * lugar de posts. Nenhuma seção aqui inventa nada: equipe e mapa usam dado
 * real, antes/depois só entra com foto autorizada, a grade do Instagram só
 * mostra publicação que a empresa colocou, avaliações ficam num estado vazio
 * honesto até existir uma de verdade. Ver PRODUCT.md, "Evidence on Hand".
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

/**
 * Texto alternativo das imagens do site.
 *
 * Duas regras, e a segunda é a que se esquece:
 *
 * 1. **Imagem que carrega informação ganha `alt` descritivo.** A foto do
 *    trabalho da empresa é conteúdo — quem usa leitor de tela precisa saber
 *    que existe e do que é.
 * 2. **Imagem decorativa, ou já descrita pelo texto ao lado, leva `alt=""`.**
 *    Não é descuido: `alt` repetido faz o leitor de tela ler a mesma coisa
 *    duas vezes seguidas, e é pior que o silêncio. Vale sobretudo para imagem
 *    dentro de botão que já tem `aria-label`.
 *
 * O nome da empresa entra no texto porque o site é dela — "foto de Laura
 * Faust" diz mais que "foto do estabelecimento" para quem chegou pelo link.
 */
export const altDaCapa = negocio => `Ambiente de ${negocio?.nome || 'atendimento'}`;
export const altDoServico = (nome, negocio) =>
  `${nome}${negocio?.nome ? ` — ${negocio.nome}` : ''}`;

export function HeroClinica({ dados, negocio, marca, textos, aoAgendar }) {
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
          {/* A frase que a empresa escreveu para este lugar, quando existe. A
              primeira frase do "sobre" é o fallback — descreve o negócio em
              vez de falar com quem acabou de chegar, e por isso deixou de ser
              a única opção (ver `textos.hero` na config). */}
          {(textos?.hero || negocio.sobre) && (
            <p className="slogan">{textos?.hero || primeiraFrase(negocio.sobre)}</p>
          )}
          <div className="chamada">
            <button className="b clinica-cta-ouro" onClick={() => aoAgendar(null)}>
              {textos?.chamada || 'Agende seu horário'} <ArrowRight size={15} />
            </button>
            <a className="clinica-cta-link" href="#servicos">
              Conheça os serviços <ArrowDown size={14} />
            </a>
          </div>
          <Lugares dados={dados} className="local" />
        </div>
        <div className="clinica-hero-quadro">
          <CarrosselHero marca={marca} negocio={negocio}
                         inicial={(negocio.nome || '?').trim()[0]?.toUpperCase()} />
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
function CarrosselHero({ marca, inicial, negocio }) {
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
      {/* A foto do topo é a primeira impressão do negócio — quem não a vê
          precisa saber que ela existe e do que é. Com várias, o número diz
          qual está na tela, senão o leitor anuncia a mesma coisa a cada troca. */}
      {imagens.length > 0
        ? <img key={i} src={imagens[i]}
               alt={`${altDaCapa(negocio)}${imagens.length > 1 ? ` (${i + 1} de ${imagens.length})` : ''}`} />
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

/* ── serviços em cartão ──
   A referência mostra cada tratamento como um cartão: foto larga em cima,
   rótulo pequeno em dourado, nome, uma linha de descrição e, no rodapé,
   duração e preço. A cliente pediu esse desenho no lugar da grade de círculos
   que os outros três modelos usam — a foto redonda continua sendo a gramática
   deles; aqui o cartão é o pedido.

   O mesmo cartão serve aos dois modos da vitrine: com "separar por categoria"
   ligado, cada cartão é uma categoria (foto do primeiro serviço com foto, os
   nomes dos serviços como descrição, "a partir de" o menor preço); desligado,
   cada cartão é um serviço. Tudo que aparece é dado cadastrado — nada de
   frase de efeito por serviço, que a referência tinha e a empresa não tem
   onde escrever. */

export function CartoesClinica({ servicos, categorias, exibir, negocio, aoAgendar, aoAbrir }) {
  const porCategoria = exibir?.categorias && categorias.length > 1;
  // Com uma categoria só (ou nenhuma) o rótulo repetiria a mesma palavra em
  // todo cartão — só entra quando distingue alguma coisa.
  const comRotulo = categorias.length > 1;

  return (
    <>
      <div className="cartoes">
        {porCategoria
          ? categorias.map(({ nome, itens }, i) => {
              const precos = itens.map(s => s.preco).filter(p => p != null);
              const menor = precos.length ? Math.min(...precos) : null;
              return (
                <Revela key={nome} className={`atraso-${Math.min(i, 5)}`}>
                  <Cartao
                    foto={itens.find(s => s.foto)?.foto}
                    inicial={nome?.[0]}
                    rotulo={`${itens.length} ${itens.length === 1 ? 'opção' : 'opções'}`}
                    nome={nome}
                    descricao={itens.map(s => s.nome).join(' · ')}
                    pe={menor != null ? [`a partir de ${brl(menor)}`] : []}
                    acao={`Agendar em ${nome}, ${itens.length} opções`}
                    // A foto do cartão é de um dos serviços do grupo — dizer
                    // "categoria Unhas" descreveria o cartão, não a imagem.
                    altFoto={altDoServico(itens.find(s => s.foto)?.nome || nome, negocio)}
                    aoClicar={() => aoAbrir(nome)}
                    /* A dúvida cita a categoria: é o que está na tela, e quem
                       está em dúvida ainda não escolheu o serviço. */
                    extra={<PerguntarSobre negocio={negocio} servico={{ nome }} className="cartao-duvida" />} />
                </Revela>
              );
            })
          : servicos.map((s, i) => (
              <Revela key={s.id} className={`atraso-${Math.min(i, 5)}`}>
                <Cartao
                  foto={s.foto}
                  inicial={s.nome.trim()[0]}
                  rotulo={comRotulo ? s.categoria : null}
                  nome={s.nome}
                  descricao={s.descricao}
                  /* Preço nulo já vem assim do servidor quando a empresa
                     esconde preço — vira "Sob consulta", como na grade. */
                  pe={[
                    exibir?.duracao ? duracaoTexto(s.duracao) : null,
                    s.preco != null ? brl(s.preco) : 'Sob consulta',
                  ].filter(Boolean)}
                  acao={`Agendar ${s.nome}`}
                  altFoto={altDoServico(s.nome, negocio)}
                  aoClicar={() => aoAgendar(s.id)}
                  /* Quem tem dúvida pergunta daqui, sem rolar até o rodapé. */
                  extra={<PerguntarSobre negocio={negocio} servico={s} className="cartao-duvida" />} />
              </Revela>
            ))}
      </div>

      {/* A linha que fecha a seção na referência convidava a conversar. A
          nossa também — pelo WhatsApp real da empresa, e só quando ele
          existe. */}
      {negocio.whatsapp && (
        <Revela>
          <div className="cartoes-pe">
            <p>Em dúvida sobre qual escolher? É só perguntar.</p>
            <a className="clinica-cta-link" href={`https://wa.me/55${soDigitos(negocio.whatsapp)}`}
               target="_blank" rel="noreferrer">
              Falar no WhatsApp <ArrowRight size={15} />
            </a>
          </div>
        </Revela>
      )}
    </>
  );
}

/**
 * Um cartão. O botão de verdade é o `.cartao-acao`, esticado por cima do
 * cartão inteiro e invisível — o cartão todo responde ao toque, o leitor de
 * tela anuncia um botão com nome, e o HTML continua válido (título e
 * parágrafo não podem morar dentro de <button>). O círculo com o "+" é só
 * desenho, como na referência.
 */
function Cartao({ foto, inicial, rotulo, nome, descricao, pe, acao, aoClicar, extra, altFoto }) {
  return (
    <article className="cartao">
      <div className="cartao-img">
        {/* A foto mostra o trabalho, e não está dentro do botão — o
            `.cartao-acao` é irmão dela. Então o `alt` acrescenta em vez de
            repetir o que o botão já anuncia. */}
        {foto
          ? <img src={foto} alt={altFoto || ''} loading="lazy" />
          : <span className="cartao-inicial">{(inicial || '?').toUpperCase()}</span>}
        <span className="cartao-mais" aria-hidden="true"><Plus size={15} /></span>
      </div>
      <div className="cartao-corpo">
        {rotulo && <span className="cartao-rotulo">{rotulo}</span>}
        <h3 className="cartao-nome">{nome}</h3>
        {descricao && <p className="cartao-desc">{descricao}</p>}
        {pe.length > 0 && (
          <div className="cartao-pe">
            {pe.map(t => <span key={t}>{t}</span>)}
          </div>
        )}
      </div>
      <button type="button" className="cartao-acao" onClick={aoClicar} aria-label={acao} />
      {/* Depois do `.cartao-acao`, que cobre o cartão inteiro: o que vier aqui
          precisa ficar por cima dele para receber o toque (ver `.cartao-duvida`
          no CSS), senão o cartão engole o clique e manda agendar. */}
      {extra}
    </article>
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
   O painel da referência: cabeçalho de perfil (avatar, @, nome, "Seguir") e
   embaixo a grade 3×2 das publicações. A grade só aparece com publicação de
   verdade — hoje as que a empresa escolhe no painel (foto + link do post);
   quando a conexão com a conta existir, é a mesma lista, preenchida por um
   job. Sem nenhuma, fica só o cabeçalho com o link para o perfil real —
   nunca um grid fingindo mostrar posts que o site não tem. */

export function SecaoInstagram({ negocio, marca, posts = [] }) {
  if (!negocio.instagram) return null;
  const arroba = negocio.instagram.replace('@', '');
  const perfil = `https://instagram.com/${arroba}`;
  return (
    <section id="instagram" className="bloco bloco-marca">
      <div className="env-largo">
        <Revela>
          <div className="secao-cab">
            <div>
              <p className="olho">Instagram</p>
              <h2 className="bloco-titulo">O dia a dia <em>continua lá.</em></h2>
            </div>
            <a className="insta-arroba" href={perfil} target="_blank" rel="noreferrer">
              <Instagram size={16} /> @{arroba} <ExternalLink size={13} />
            </a>
          </div>
        </Revela>

        <Revela>
          <div className="insta-painel">
            <div className="insta-cab">
              {/* O avatar é o logo da empresa (o site não tem acesso à foto do
                  perfil); sem logo, a inicial sobre a cor da marca. */}
              <span className="insta-avatar" aria-hidden="true">
                {marca?.logo
                  ? <img src={marca.logo} alt="" />
                  : (negocio.nome || '?').trim()[0]?.toUpperCase()}
              </span>
              <div className="insta-txt">
                <b>{arroba}</b>
                <p>{negocio.nome}</p>
              </div>
              <a className="b b-p b-peq" href={perfil} target="_blank" rel="noreferrer">
                Seguir
              </a>
            </div>

            {posts.length > 0 && (
              <div className="insta-grade">
                {posts.map((p, i) => (
                  /* Sem link do post, o toque abre o perfil — nunca um
                     quadrado que não leva a lugar nenhum. */
                  <a key={p.imagem + i} className="insta-post" href={p.link || perfil}
                     target="_blank" rel="noreferrer"
                     aria-label={`Publicação ${i + 1} de ${posts.length} no Instagram`}>
                    {/* `alt=""` de propósito: a imagem está DENTRO do link, que
                        já se anuncia. Descrevê-la aqui faria o leitor de tela
                        ler a mesma publicação duas vezes. */}
                    <img src={p.imagem} alt="" loading="lazy" />
                    {p.tipo === 'video' && (
                      <span className="insta-play" aria-hidden="true"><Play size={13} fill="currentColor" /></span>
                    )}
                  </a>
                ))}
              </div>
            )}
          </div>
        </Revela>
      </div>
    </section>
  );
}

/* ── mapa ──
   Embed do Google Maps sem chave de API — só o endereço da própria empresa,
   nunca uma localização inventada. Com mais de uma unidade, um mapa por
   endereço: a cliente vem ver onde fica a loja que ela vai, não a sede. */

export function SecaoMapa({ dados }) {
  const onde = lugares(dados);
  if (!onde.length) return null;
  return (
    <section id="contato" className="bloco">
      <div className="env-largo">
        <TituloClinica olho="Onde estamos">
          {onde.length > 1 ? <>Perto de <em>você.</em></> : <>Um lugar para <em>você chegar.</em></>}
        </TituloClinica>
        <div className={'mapas' + (onde.length > 1 ? ' mapas-varios' : '')}>
          {onde.map(l => (
            <Revela key={l.id || 'sede'}>
              {l.nome && (
                <p className="mapa-unidade">
                  <b>{l.nome}</b>
                  <span>{l.endereco}</span>
                </p>
              )}
              <div className="mapa-caixa clinica-mapa">
                <iframe
                  title={`Localização no mapa${l.nome ? ` — ${l.nome}` : ''}`}
                  src={`https://www.google.com/maps?q=${encodeURIComponent(l.endereco)}&output=embed`}
                  loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              </div>
            </Revela>
          ))}
        </div>
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
