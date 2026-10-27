import { ArrowRight, Calendar, Check, Clock, MapPin, MessageCircle, Smartphone } from 'lucide-react';
import { soDigitos } from '../datas.js';
import { lugares } from '../enderecos.js';
import {
  AntesDepois, Assinatura, Avaliacoes, CartaoPromo, Contato, Equipe, FotoServico, Mapas, Perguntas, PerguntarSobre,
  Preco, Publicacoes, Revela, comDestaque, duracaoTexto, fotoDoSite, horarioCurto, useFiltro,
} from './comum.jsx';
import { tituloProprio, ComItalico } from '../titulos.jsx';

/**
 * Serena (id `caderneta`) — estrutura a partir da referência Glowence que o
 * dono trouxe (out/2026): topo em três colunas — foto, cartão de título,
 * foto —; uma fileira de quatro destaques com ícone; o "sobre" com lista;
 * as especialidades e os serviços em cartões suaves; uma faixa da cor da
 * empresa com o passo a passo de agendar; perguntas em duas colunas; rodapé
 * em quatro colunas na cor escura da empresa.
 *
 * A palavra final de cada título vai em itálico serifado — a assinatura da
 * referência. Os destaques do topo são fatos da própria empresa (horário,
 * endereço, WhatsApp, agendamento online), nunca números de vaidade: a
 * referência tinha "279 clientes satisfeitos", e nós não temos esse dado.
 */
export default function Serena({ dados, servicos, categorias, combos, agendar, aoAgendar, aoAgendarCombo, ligada, temOQueAgendar }) {
  const { negocio, marca, textos, exibir } = dados;
  const T = chave => tituloProprio(dados, chave);
  const titulo = comDestaque(textos?.hero || negocio.nome);
  const { visiveis, Abas } = useFiltro(categorias, exibir);
  const onde = lugares(dados)[0];
  const horario = horarioCurto(negocio.horarios);

  const destaques = [
    agendar && { icone: Smartphone, titulo: 'Agende online', texto: 'A qualquer hora, sem cadastro: só com o seu WhatsApp.' },
    horario && { icone: Clock, titulo: 'Horário', texto: horario },
    onde && { icone: MapPin, titulo: onde.nome || negocio.cidade || 'Endereço', texto: onde.endereco, href: onde.mapa },
    negocio.whatsapp && { icone: MessageCircle, titulo: 'WhatsApp', texto: 'Tire dúvidas antes de agendar.', href: `https://wa.me/55${soDigitos(negocio.whatsapp)}` },
  ].filter(Boolean);

  return (
    <>
      <section className="se-topo">
        <div className="se-topo-in">
          <div className="se-topo-foto se-foto-a"><img src={fotoDoSite(marca, 'capa')} alt="" /></div>
          <div className="se-topo-cartao">
            {(negocio.cidade || textos?.hero) && <p className="se-selo">{textos?.hero ? negocio.nome : negocio.cidade}</p>}
            <h1 className={(titulo.inicio + titulo.fim).length > 40 ? 'md-longo' : undefined}>{titulo.inicio}<em>{titulo.fim}</em></h1>
            {negocio.slogan && <p className="se-lead">{negocio.slogan}</p>}
            {agendar && <button className="b b-p" onClick={() => agendar(null)}><Calendar size={16} /> {textos?.chamada || 'Agendar horário'}</button>}
          </div>
          <div className="se-topo-foto se-foto-b"><img src={fotoDoSite(marca, 'foto2')} alt="" /></div>
        </div>
      </section>

      {destaques.length > 0 && (
        <section className="se-destaques">
          <div className="md-env se-destaques-in">
            {destaques.map(d => {
              const Corpo = (
                <>
                  <d.icone size={22} strokeWidth={1.6} aria-hidden="true" />
                  <h3>{d.titulo}</h3>
                  <p>{d.texto}</p>
                </>
              );
              return d.href
                ? <a key={d.titulo} className="se-destaque" href={d.href} target="_blank" rel="noreferrer">{Corpo}</a>
                : <div key={d.titulo} className="se-destaque">{Corpo}</div>;
            })}
          </div>
        </section>
      )}

      {negocio.sobre && (
        <section id="sobre" className="se-sec">
          <div className="md-env se-sobre-in">
            <Revela className="se-sobre-texto">
              <p className="se-rotulo">Sobre nós</p>
              <h2><ComItalico texto={T('sobre') || negocio.nome} /></h2>
              <p>{negocio.sobre}</p>
              {exibir?.categorias !== false && categorias.length > 1 && (
                <ul className="se-lista">
                  {categorias.slice(0, 5).map(c => <li key={c.nome}><Check size={16} aria-hidden="true" /> {c.nome}</li>)}
                </ul>
              )}
            </Revela>
            <div className="se-sobre-foto"><img src={fotoDoSite(marca, 'foto3')} alt="" loading="lazy" /></div>
          </div>
        </section>
      )}

      <section id="servicos" className="se-sec se-sec-tom">
        <div className="md-env">
          <header className="se-cab">
            <p className="se-rotulo">Nossos serviços</p>
            <h2>{T('servicos') ? <ComItalico texto={T('servicos')} /> : <>Cuidado do seu <em>jeito</em></>}</h2>
          </header>
          <Abas className="md-abas se-abas" />
          {servicos.length === 0 && (
            <p className="md-vazio">{temOQueAgendar ? 'Por enquanto, só as promoções.' : 'Em breve: os serviços e os horários para agendar aparecem aqui.'}</p>
          )}
          <div className="se-cartoes">
            {visiveis.map((s, i) => (
              <Revela key={s.id} className={`atraso-${Math.min(i % 3, 5)}`}>
                <article className="se-cartao">
                  <FotoServico s={s} className="md-foto se-cartao-foto" />
                  <div className="se-cartao-corpo">
                    <h3>{s.nome}</h3>
                    {s.descricao && <p className="se-desc">{s.descricao}</p>}
                    <p className="se-meta"><Preco s={s} />{exibir?.duracao && <span>{duracaoTexto(s.duracao)}</span>}</p>
                    <div className="se-cartao-acoes">
                      <button className="b b-p b-peq" onClick={() => aoAgendar(s.id)}>
                        {textos?.botaoAgendar || 'Agendar'}
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

      {agendar && (
        <section className="se-passos">
          <div className="md-env">
            <header className="se-cab se-cab-claro">
              <p className="se-rotulo">Como funciona</p>
              <h2>{T('passos') ? <ComItalico texto={T('passos')} /> : <>Agendar é <em>simples</em></>}</h2>
            </header>
            <ol className="se-passos-lista">
              <li><b>1</b><h3>Escolha o serviço</h3><p>E, se quiser, quem vai te atender.</p></li>
              <li><b>2</b><h3>Escolha o horário</h3><p>Só aparecem os horários livres de verdade.</p></li>
              <li><b>3</b><h3>Confirme</h3><p>Com o seu WhatsApp, sem criar senha.</p></li>
              <li><b>4</b><h3>É só vir</h3><p>O horário fica reservado para você.</p></li>
            </ol>
            <button className="b se-btn-claro" onClick={() => agendar(null)}>Agendar agora <ArrowRight size={16} /></button>
          </div>
        </section>
      )}

      {combos.length > 0 && (
        <section className="se-sec">
          <div className="md-env">
            <header className="se-cab"><p className="se-rotulo">Promoções</p><h2>{T('promocoes') ? <ComItalico texto={T('promocoes')} /> : <>Para <em>aproveitar</em></>}</h2></header>
            <div className="se-promos">
              {combos.map(c => <CartaoPromo key={c.id} c={c} exibir={exibir} aoAgendar={aoAgendarCombo} />)}
            </div>
          </div>
        </section>
      )}

      {dados.equipe?.length > 0 && (
        <section id="equipe" className="se-sec se-sec-tom">
          <div className="md-env">
            <header className="se-cab"><p className="se-rotulo">Equipe</p><h2>{T('equipe') ? <ComItalico texto={T('equipe')} /> : <>Quem cuida de <em>você</em></>}</h2></header>
            <Equipe equipe={dados.equipe} className="md-equipe se-equipe" />
          </div>
        </section>
      )}

      {dados.antesDepois?.length > 0 && (
        <section className="se-sec">
          <div className="md-env">
            <header className="se-cab"><p className="se-rotulo">Resultados</p><h2>{T('antesDepois') ? <ComItalico texto={T('antesDepois')} /> : <>Antes e <em>depois</em></>}</h2></header>
            <AntesDepois casos={dados.antesDepois} className="md-casos se-casos" />
          </div>
        </section>
      )}

      {dados.avaliacoes && (
        <section className="se-sec se-sec-tom">
          <div className="md-env">
            <header className="se-cab"><p className="se-rotulo">Avaliações</p><h2>{T('avaliacoes') ? <ComItalico texto={T('avaliacoes')} /> : <>O que dizem de <em>nós</em></>}</h2></header>
            <Avaliacoes avaliacoes={dados.avaliacoes} />
          </div>
        </section>
      )}

      {dados.faq?.length > 0 && (
        <section id="perguntas" className="se-sec">
          <div className="md-env se-faq-in">
            <div>
              <p className="se-rotulo">Dúvidas</p>
              <h2>{T('perguntas') ? <ComItalico texto={T('perguntas')} /> : <>Respostas para as suas <em>perguntas</em></>}</h2>
              <p className="se-lead">Não achou o que procura? Fale com a gente no WhatsApp.</p>
            </div>
            <Perguntas faq={dados.faq} negocio={negocio} />
          </div>
        </section>
      )}

      {ligada('mapa') && lugares(dados).length > 0 && (
        <section id="contato" className="se-sec se-sec-tom">
          <div className="md-env">
            <header className="se-cab"><p className="se-rotulo">Onde estamos</p><h2>{T('mapa') ? <ComItalico texto={T('mapa')} /> : <>Venha nos <em>visitar</em></>}</h2></header>
            <Mapas dados={dados} />
          </div>
        </section>
      )}

      {ligada('instagram') && negocio.instagram && (
        <section className="se-sec se-insta">
          <div className="md-env">
            <header className="se-cab"><p className="se-rotulo">Instagram</p><h2>{T('instagram') ? <ComItalico texto={T('instagram')} /> : <>Siga a nossa <em>rotina</em></>}</h2></header>
            <Publicacoes negocio={negocio} posts={dados.instagramPosts} className="md-insta se-insta-in" />
          </div>
        </section>
      )}
    </>
  );
}

/** Rodapé em colunas na cor escura da empresa. */
export function RodapeSerena({ dados, negocio, agendar, mostrarPagamento }) {
  return (
    <footer className="se-rodape">
      <div className="md-env se-rodape-in">
        <div>
          <p className="se-rodape-nome">{negocio.nome}</p>
          {negocio.slogan && <p className="se-rodape-texto">{negocio.slogan}</p>}
          {agendar && <button className="b se-btn-claro" onClick={() => agendar(null)}><Calendar size={16} /> Agendar</button>}
        </div>
        <Contato dados={dados} negocio={negocio} mostrarPagamento={mostrarPagamento} />
      </div>
      <Assinatura dados={dados} />
    </footer>
  );
}
