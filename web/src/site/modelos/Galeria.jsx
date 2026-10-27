import { useRef } from 'react';
import { ArrowLeft, ArrowRight, Calendar, Sparkles } from 'lucide-react';
import { quandoVale } from '../../shared/promocao.js';
import {
  AntesDepois, Assinatura, Avaliacoes, Contato, Equipe, FotoServico, Mapas, Perguntas, Preco, Publicacoes, Revela,
  brl, duracaoTexto, fotoDoSite,
} from './comum.jsx';
import { lugares } from '../enderecos.js';

/**
 * Galeria (id `quadro`) — estrutura a partir da referência Aesthetica que o
 * dono trouxe (out/2026): foto de ponta a ponta com uma caixa clara de título
 * por cima; o "sobre" como uma frase grande e centralizada; os serviços num
 * carrossel de cartões altos com foto; promoções correndo numa faixa e uma em
 * destaque ao lado de foto; a equipe; e uma tabela de preços por categoria
 * ao lado de foto — a peça que a referência chama de "price guide".
 *
 * Títulos em caixa-alta leve e espaçada, cantos retos: a página é uma
 * vitrine de galeria, onde a foto é o objeto e o texto é a etiqueta.
 */
export default function Galeria({ dados, servicos, categorias, combos, agendar, aoAgendar, aoAgendarCombo, ligada, temOQueAgendar }) {
  const { negocio, marca, textos, exibir } = dados;
  const titulo = textos?.hero || negocio.nome;
  // "Separar por categoria" desligado: a tabela vira uma lista só, e o
  // carrossel deixa de rotular cada serviço com a categoria.
  const porCategoria = exibir?.categorias !== false;
  const grupos = porCategoria ? categorias : [{ nome: 'Serviços', itens: servicos }];

  return (
    <>
      <section className="ga-topo">
        <img className="ga-topo-foto" src={fotoDoSite(marca, 'capa')} alt="" />
        <div className="md-env ga-topo-in">
          <div className="ga-caixa">
            {textos?.hero && <p className="ga-rotulo">{negocio.nome}</p>}
            <h1 className={titulo.length > 40 ? 'md-longo' : undefined}>{titulo}</h1>
            {negocio.slogan && <p className="ga-lead">{negocio.slogan}</p>}
            <div className="ga-botoes">
              {agendar && <button className="b b-p" onClick={() => agendar(null)}><Calendar size={16} /> {textos?.chamada || 'Agendar'}</button>}
              <a className="b ga-btn-linha" href="#servicos">Ver serviços</a>
            </div>
          </div>
        </div>
      </section>

      {negocio.sobre && (
        <section id="sobre" className="ga-frase">
          <div className="md-env md-env-estreito">
            <Revela>
              <p className="ga-rotulo">Sobre</p>
              <p className="ga-frase-texto">{negocio.sobre}</p>
            </Revela>
          </div>
        </section>
      )}

      <section id="servicos" className="ga-servicos">
        <div className="md-env">
          <header className="ga-cab"><h2>Serviços</h2></header>
          {servicos.length === 0 && (
            <p className="md-vazio">{temOQueAgendar ? 'Por enquanto, só as promoções.' : 'Em breve: os serviços e os horários para agendar aparecem aqui.'}</p>
          )}
        </div>
        {servicos.length > 0 && <Carrossel servicos={servicos} exibir={exibir} textos={textos}
                                           porCategoria={porCategoria} aoAgendar={aoAgendar} />}
      </section>

      {combos.length > 0 && (
        <>
          <div className="ga-faixa" aria-hidden="true">
            <div className="ga-faixa-trilho">
              {[0, 1].map(volta => (
                <span key={volta}>
                  {combos.map(c => <b key={c.id}>{c.nome} · {brl(c.preco)}</b>)}
                </span>
              ))}
            </div>
          </div>
          <section className="ga-destaque">
            <div className="md-env ga-destaque-in">
              <div className="ga-destaque-foto"><img src={fotoDoSite(marca, 'foto3')} alt="" loading="lazy" /></div>
              <div className="ga-destaque-lista">
                {combos.map(c => (
                  <Revela key={c.id}>
                    <article className="ga-promo">
                      <p className="ga-rotulo"><Sparkles size={13} /> Promoção</p>
                      <h3>{c.nome}</h3>
                      <p className="ga-promo-itens">{c.servicos.map(s => s.nome).join(' + ')}</p>
                      <p className="ga-promo-preco"><s>{brl(c.precoCheio)}</s> <strong>{brl(c.preco)}</strong></p>
                      <p className="ga-promo-eco">
                        economize {brl(c.economia)}{exibir?.duracao && <> · {duracaoTexto(c.duracao)} no total</>}
                        {quandoVale(c) && <> · {quandoVale(c)}</>}
                      </p>
                      <button className="b ga-btn-linha" onClick={() => aoAgendarCombo(c.id)}>Aproveitar</button>
                    </article>
                  </Revela>
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      {dados.equipe?.length > 0 && (
        <section id="equipe" className="ga-sec">
          <div className="md-env">
            <header className="ga-cab"><h2>Nossa equipe</h2></header>
            <Equipe equipe={dados.equipe} className="md-equipe ga-equipe" />
          </div>
        </section>
      )}

      {dados.antesDepois?.length > 0 && (
        <section className="ga-sec ga-sec-tom">
          <div className="md-env">
            <header className="ga-cab"><h2>Resultados reais</h2></header>
            <AntesDepois casos={dados.antesDepois} className="md-casos ga-casos" />
          </div>
        </section>
      )}

      {servicos.length > 0 && (
        <section id="precos" className="ga-sec">
          <div className="md-env ga-precos-in">
            <div className="ga-precos-foto"><img src={fotoDoSite(marca, 'foto2')} alt="" loading="lazy" /></div>
            <div>
              <header className="ga-cab ga-cab-esq"><h2>Tabela de preços</h2></header>
              {grupos.map(cat => (
                <div key={cat.nome} className="ga-tabela">
                  {grupos.length > 1 && <h3>{cat.nome}</h3>}
                  <ul>
                    {cat.itens.map(s => (
                      <li key={s.id}>
                        <button onClick={() => aoAgendar(s.id)} aria-label={`Agendar ${s.nome}`}>
                          <span className="ga-tabela-nome">{s.nome}</span>
                          <i aria-hidden="true" />
                          <span className="ga-tabela-valor">
                            {exibir?.duracao && <small>{duracaoTexto(s.duracao)}</small>}
                            <Preco s={s} />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {agendar && <button className="b b-p" onClick={() => agendar(null)}><Calendar size={16} /> Agendar horário</button>}
            </div>
          </div>
        </section>
      )}

      {dados.avaliacoes && (
        <section className="ga-sec ga-sec-tom">
          <div className="md-env">
            <header className="ga-cab"><h2>O que dizem</h2></header>
            <Avaliacoes avaliacoes={dados.avaliacoes} />
          </div>
        </section>
      )}

      {dados.faq?.length > 0 && (
        <section id="perguntas" className="ga-sec">
          <div className="md-env md-env-estreito">
            <header className="ga-cab"><h2>Dúvidas</h2></header>
            <Perguntas faq={dados.faq} negocio={negocio} />
          </div>
        </section>
      )}

      {ligada('mapa') && lugares(dados).length > 0 && (
        <section id="contato" className="ga-sec ga-sec-tom">
          <div className="md-env">
            <header className="ga-cab"><h2>Onde estamos</h2></header>
            <Mapas dados={dados} />
          </div>
        </section>
      )}

      {ligada('instagram') && negocio.instagram && (
        <section className="ga-insta">
          <Publicacoes negocio={negocio} posts={dados.instagramPosts} className="md-insta ga-insta-in" />
        </section>
      )}
    </>
  );
}

/**
 * Os serviços em cartões altos, de lado. Rolagem nativa com encaixe — o
 * dedo já sabe fazer isso no celular; no computador, duas setas.
 */
function Carrossel({ servicos, exibir, textos, porCategoria, aoAgendar }) {
  const trilho = useRef(null);
  const andar = sentido => trilho.current?.scrollBy({ left: sentido * trilho.current.clientWidth * 0.8, behavior: 'smooth' });
  return (
    <div className="ga-carrossel">
      <div className="ga-trilho" ref={trilho}>
        {servicos.map(s => (
          <button key={s.id} className="ga-cartao" onClick={() => aoAgendar(s.id)} aria-label={`Agendar ${s.nome}`}>
            <FotoServico s={s} className="md-foto ga-cartao-foto" />
            <span className="ga-cartao-texto">
              {porCategoria && s.categoria && <small>{s.categoria}</small>}
              <strong>{s.nome}</strong>
              <span>
                <Preco s={s} />
                {exibir?.duracao && <> · {duracaoTexto(s.duracao)}</>}
              </span>
              <em className="ga-cartao-acao">{textos?.botaoAgendar || 'Agendar'} <ArrowRight size={14} /></em>
            </span>
          </button>
        ))}
      </div>
      {servicos.length > 3 && (
        <div className="md-env ga-setas">
          <button onClick={() => andar(-1)} aria-label="Serviços anteriores"><ArrowLeft size={18} /></button>
          <button onClick={() => andar(1)} aria-label="Próximos serviços"><ArrowRight size={18} /></button>
        </div>
      )}
    </div>
  );
}

/** Rodapé centralizado: o nome no meio, contato embaixo, como a referência. */
export function RodapeGaleria({ dados, negocio, agendar, mostrarPagamento }) {
  return (
    <footer className="ga-rodape">
      <div className="md-env ga-rodape-in">
        <p className="ga-rodape-nome">{negocio.nome}</p>
        {agendar && <button className="b ga-btn-linha" onClick={() => agendar(null)}><Calendar size={16} /> Agendar horário</button>}
        <Contato dados={dados} negocio={negocio} mostrarPagamento={mostrarPagamento} />
      </div>
      <Assinatura dados={dados} />
    </footer>
  );
}
