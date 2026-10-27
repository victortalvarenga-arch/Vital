import { useState } from 'react';
import { ArrowRight, Calendar, Instagram, Sparkles } from 'lucide-react';
import { quandoVale } from '../../shared/promocao.js';
import {
  AntesDepois, Assinatura, Avaliacoes, CartaoPromo, Contato, Equipe, FotoServico, Mapas, Perguntas, PerguntarSobre,
  Preco, Publicacoes, Revela, brl, duracaoTexto, fotoDoSite, useFiltro,
} from './comum.jsx';
import { tituloProprio } from '../titulos.jsx';
import { lugares } from '../enderecos.js';

/**
 * Essencial (id `bandeja`) — estrutura a partir da referência Meni que o dono
 * trouxe (out/2026): topo dividido, texto à esquerda sobre um tom lavado da
 * marca e foto sangrando à direita; logo abaixo, uma barra de "agende" com o
 * serviço já escolhível; serviços em cartões com foto, quatro por linha; o
 * "sobre" em bloco dividido sobre faixa escura; promoções numa faixa da cor da
 * empresa; antes e depois em grade; rodapé em duas metades.
 *
 * Leitura centralizada nos títulos de seção e à esquerda no conteúdo — é o
 * que a referência faz, e é o que mantém a grade alinhada com qualquer
 * quantidade de serviço.
 */
export default function Essencial({ dados, servicos, categorias, combos, agendar, aoAgendar, aoAgendarCombo, ligada, temOQueAgendar }) {
  const { negocio, marca, textos, exibir } = dados;
  const T = chave => tituloProprio(dados, chave);
  const titulo = textos?.hero || negocio.nome;
  const kicker = textos?.hero ? negocio.nome : (negocio.slogan || negocio.cidade);
  const { visiveis, Abas } = useFiltro(categorias, exibir);
  // Branco e tom da marca alternando entre as seções que existem nesta
  // empresa. Com a cor fixa por seção, quem não tem "Sobre" nem promoção
  // ficava com três faixas brancas seguidas. Só é chamada por seção que
  // renderiza, então a alternância segue o que está na tela.
  let n = 0;
  const faixa = () => (n++ % 2 ? ' es-sec-tom' : '');

  return (
    <>
      <section className="es-topo">
        <div className="md-env es-topo-in">
          <div className="es-topo-texto">
            {kicker && <p className="es-kicker">{kicker}</p>}
            <h1 className={titulo.length > 40 ? 'md-longo' : undefined}>{titulo}</h1>
            {textos?.hero && negocio.slogan && <p className="es-lead">{negocio.slogan}</p>}
            {agendar && (
              <button className="b es-btn-linha" onClick={() => agendar(null)}>
                {textos?.chamada || 'Agende seu horário'} <ArrowRight size={16} />
              </button>
            )}
          </div>
          <div className="es-topo-foto">
            <img src={fotoDoSite(marca, 'capa')} alt="" />
          </div>
        </div>
      </section>

      {agendar && servicos.length > 0 && <Reserva servicos={servicos} aoAgendar={aoAgendar} />}

      <section id="servicos" className={'es-sec' + faixa()}>
        <div className="md-env">
          <Revela>
            <header className="es-cab">
              <p className="es-kicker">O que fazemos</p>
              <h2>{T('servicos') || 'Nossos serviços'}</h2>
            </header>
          </Revela>
          <Abas className="md-abas es-abas" />
          {servicos.length === 0 && (
            <p className="md-vazio">{temOQueAgendar ? 'Por enquanto, só as promoções.' : 'Em breve: os serviços e os horários para agendar aparecem aqui.'}</p>
          )}
          <div className="es-cartoes">
            {visiveis.map((s, i) => (
              <Revela key={s.id} className={`atraso-${Math.min(i % 4, 5)}`}>
                <article className="es-cartao">
                  <button className="es-cartao-foto" onClick={() => aoAgendar(s.id)} aria-label={`Agendar ${s.nome}`}>
                    <FotoServico s={s} />
                  </button>
                  <div className="es-cartao-corpo">
                    {exibir?.categorias !== false && s.categoria && <p className="es-kicker">{s.categoria}</p>}
                    <h3>{s.nome}</h3>
                    {s.descricao && <p className="es-desc">{s.descricao}</p>}
                    <p className="es-meta">
                      <Preco s={s} />
                      {exibir?.duracao && <span>{duracaoTexto(s.duracao)}</span>}
                    </p>
                    <div className="es-cartao-acoes">
                      <button className="es-link" onClick={() => aoAgendar(s.id)}>
                        {textos?.botaoAgendar || 'Agendar'} <ArrowRight size={14} />
                      </button>
                      <PerguntarSobre negocio={negocio} servico={s} className="md-duvida" />
                    </div>
                  </div>
                </article>
              </Revela>
            ))}
          </div>
        </div>
      </section>

      {negocio.sobre && (
        <section id="sobre" className={'es-sobre' + faixa()}>
          <div className="md-env es-sobre-in">
            <div className="es-sobre-foto"><img src={fotoDoSite(marca, 'foto2')} alt="" loading="lazy" /></div>
            <Revela className="es-sobre-texto">
              <p className="es-kicker">Sobre</p>
              <h2>{T('sobre') || negocio.nome}</h2>
              <p>{negocio.sobre}</p>
              {agendar && (
                <button className="b es-btn-linha" onClick={() => agendar(null)}>
                  Agendar agora <ArrowRight size={16} />
                </button>
              )}
            </Revela>
          </div>
        </section>
      )}

      {combos.length > 0 && (
        <section className="es-promos">
          <div className="md-env">
            <header className="es-cab es-cab-claro">
              <p className="es-kicker">Para aproveitar</p>
              <h2>{T('promocoes') || 'Promoções'}</h2>
            </header>
            {/* Uma promoção só vira faixa larga: um cartão estreito sozinho no
                meio da cor parecia que faltava alguma coisa do lado. */}
            {combos.length === 1
              ? <PromoUnica c={combos[0]} exibir={exibir} aoAgendar={aoAgendarCombo} />
              : (
                <div className="es-promos-grade">
                  {combos.map(c => <CartaoPromo key={c.id} c={c} exibir={exibir} aoAgendar={aoAgendarCombo} />)}
                </div>
              )}
          </div>
        </section>
      )}

      {dados.equipe?.length > 0 && (
        <section id="equipe" className={'es-sec' + faixa()}>
          <div className="md-env">
            <header className="es-cab"><p className="es-kicker">Quem atende</p><h2>{T('equipe') || 'Nossa equipe'}</h2></header>
            <Equipe equipe={dados.equipe} className="md-equipe es-equipe" />
          </div>
        </section>
      )}

      {dados.antesDepois?.length > 0 && (
        <section className={'es-sec' + faixa()}>
          <div className="md-env">
            <header className="es-cab"><p className="es-kicker">Resultados</p><h2>{T('antesDepois') || 'Antes e depois'}</h2></header>
            <AntesDepois casos={dados.antesDepois} className="md-casos es-casos" />
          </div>
        </section>
      )}

      {dados.avaliacoes && (
        <section className={'es-sec' + faixa()}>
          <div className="md-env">
            <header className="es-cab"><p className="es-kicker">Quem já veio</p><h2>{T('avaliacoes') || 'Avaliações'}</h2></header>
            <Avaliacoes avaliacoes={dados.avaliacoes} />
          </div>
        </section>
      )}

      {/* Instagram em duas colunas: o convite à esquerda, as publicações em
          grade 3×2 à direita. Cada modelo tem o seu: a Galeria é uma faixa
          de ponta a ponta, a Serena um mosaico. */}
      {ligada('instagram') && negocio.instagram && (
        <section className={'es-sec' + faixa()}>
          <div className="md-env es-insta-in">
            <div className="es-insta-cab">
              <p className="es-kicker">Instagram</p>
              <h2>{T('instagram') || 'Acompanhe o dia a dia'}</h2>
              <p>Novidades, resultados e bastidores, direto do perfil.</p>
              <a className="b es-btn-linha" href={`https://instagram.com/${negocio.instagram.replace('@', '')}`}
                 target="_blank" rel="noreferrer">
                <Instagram size={16} /> @{negocio.instagram.replace('@', '')}
              </a>
            </div>
            <Publicacoes negocio={negocio} posts={dados.instagramPosts} className="md-insta es-insta" />
          </div>
        </section>
      )}

      {dados.faq?.length > 0 && (
        <section id="perguntas" className={'es-sec' + faixa()}>
          <div className="md-env md-env-estreito">
            <header className="es-cab"><p className="es-kicker">Dúvidas</p><h2>{T('perguntas') || 'Perguntas frequentes'}</h2></header>
            <Perguntas faq={dados.faq} negocio={negocio} />
          </div>
        </section>
      )}

      {ligada('mapa') && lugares(dados).length > 0 && (
        <section id="contato" className={'es-sec' + faixa()}>
          <div className="md-env">
            <header className="es-cab"><p className="es-kicker">Onde estamos</p><h2>{T('mapa') || 'Como chegar'}</h2></header>
            <Mapas dados={dados} />
          </div>
        </section>
      )}
    </>
  );
}

/**
 * A barra de "agende" logo abaixo do topo — o formulário de consulta da
 * referência, aqui de verdade: escolher o serviço já abre a janela nele.
 */
function Reserva({ servicos, aoAgendar }) {
  const [escolhido, setEscolhido] = useState('');
  return (
    <div className="md-env es-reserva-env">
      <form className="es-reserva" onSubmit={e => { e.preventDefault(); aoAgendar(escolhido || null); }}>
        <p className="es-reserva-titulo">Agende <span>seu horário</span></p>
        <label className="es-reserva-campo">
          <span>Serviço</span>
          <select value={escolhido} onChange={e => setEscolhido(e.target.value)}>
            <option value="">Escolha o serviço</option>
            {servicos.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </label>
        <button className="b b-p" type="submit"><Calendar size={16} /> Ver horários</button>
      </form>
    </div>
  );
}

/** A promoção sozinha, em faixa: o que é à esquerda, o preço e o botão à direita. */
function PromoUnica({ c, exibir, aoAgendar }) {
  return (
    <Revela>
      <article className={'es-promo-unica' + (c.foto ? ' com-foto' : '')}>
        {c.foto && <div className="es-promo-foto"><img src={c.foto} alt={c.nome} loading="lazy" /></div>}
        <div>
          <span className="md-selo"><Sparkles size={13} /> Promoção</span>
          <h3>{c.nome}</h3>
          <p className="es-promo-itens">{c.servicos.map(s => s.nome).join(' + ')}</p>
          {c.descricao && <p className="es-promo-itens">{c.descricao}</p>}
          {quandoVale(c) && <p className="es-promo-quando">{quandoVale(c)}</p>}
        </div>
        <div className="es-promo-valor">
          <s>{brl(c.precoCheio)}</s>
          <strong>{brl(c.preco)}</strong>
          <span>
            economize {brl(c.economia)}
            {exibir?.duracao && <> · {duracaoTexto(c.duracao)} no total</>}
          </span>
          <button className="b b-p" onClick={() => aoAgendar(c.id)}><Calendar size={16} /> Aproveitar</button>
        </div>
      </article>
    </Revela>
  );
}

/**
 * O rodapé numa faixa da cor da empresa, em três colunas: quem é e o botão;
 * onde e como falar; horário e pagamento. Antes era uma coluna de contato
 * sobre cinza com um cartão escuro ao lado — duas peças de peso diferente que
 * não pareciam do mesmo rodapé.
 */
export function RodapeEssencial({ dados, negocio, agendar, mostrarPagamento }) {
  return (
    <footer className="es-rodape">
      <div className="md-env es-rodape-in">
        <div className="es-rodape-marca">
          <p className="es-rodape-nome">{negocio.nome}</p>
          <p className="es-rodape-frase">{negocio.slogan || 'Escolha o serviço e o horário em um minuto, a qualquer hora.'}</p>
          {agendar && <button className="b es-btn-claro" onClick={() => agendar(null)}><Calendar size={16} /> Agendar horário</button>}
        </div>
        <Contato dados={dados} negocio={negocio} mostrarPagamento={mostrarPagamento} />
      </div>
      <Assinatura dados={dados} />
    </footer>
  );
}
