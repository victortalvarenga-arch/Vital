import { useMemo, useState } from 'react';
import { Calendar, Clock, Instagram, MapPin, MessageCircle, Phone, Plus, Sparkles, Star } from 'lucide-react';
import { brl, duracaoTexto, soDigitos } from '../datas.js';
import { lugares } from '../enderecos.js';
import { linkGeral } from '../whatsapp.js';
import { quandoVale } from '../../shared/promocao.js';
import { Revela, PerguntarSobre, Horarios } from '../App.jsx';

import essencialCapa from './fotos/essencial-capa.jpg';
import essencialApoio from './fotos/essencial-apoio.jpg';
import galeriaCapa from './fotos/galeria-capa.jpg';
import galeriaApoio from './fotos/galeria-apoio.jpg';
import galeriaApoio2 from './fotos/galeria-apoio2.jpg';
import serenaCapa from './fotos/serena-capa.jpg';
import serenaApoio from './fotos/serena-apoio.jpg';
import serenaApoio2 from './fotos/serena-apoio2.jpg';

/**
 * As peças que os três modelos Essencial, Galeria e Serena montam cada um do
 * seu jeito. Cada modelo é uma composição própria (estrutura, ordem, escala);
 * o que é dado — serviço, equipe, caso, pergunta, contato — sai daqui, igual
 * para os três, para nenhum modelo mostrar uma informação que outro esconde.
 *
 * A Clínica não usa nada daqui: tem as peças dela em `Clinica.jsx`.
 */

/**
 * As fotos de exemplo de cada modelo (Unsplash, licença livre — a origem de
 * cada uma está em `fotos/ORIGEM.md`). Entram SÓ nos lugares de clima — topo,
 * sobre, faixa de apoio — e só enquanto a empresa não enviou a dela em Site
 * da cliente → Marca. Nunca em serviço, equipe ou antes e depois: ali uma foto
 * de banco fingiria ser trabalho da empresa.
 */
const EXEMPLOS = {
  bandeja: { capa: essencialCapa, foto2: essencialApoio, foto3: essencialApoio },
  quadro: { capa: galeriaCapa, foto2: galeriaApoio, foto3: galeriaApoio2 },
  caderneta: { capa: serenaCapa, foto2: serenaApoio, foto3: serenaApoio2 },
};

/** A foto do lugar `slot` ('capa' | 'foto2' | 'foto3'): a da empresa, ou a de exemplo. */
export function fotoDoSite(marca, slot) {
  return marca?.[slot] || EXEMPLOS[marca?.template]?.[slot] || EXEMPLOS.bandeja[slot];
}

/** Serviços que se vendem sozinhos, e as categorias deles na ordem do catálogo. */
export function useCatalogo(dados) {
  const servicos = useMemo(() => dados.servicos.filter(s => !s.somenteAdicional), [dados.servicos]);
  const categorias = useMemo(() => {
    const mapa = new Map();
    for (const s of servicos) {
      const c = s.categoria || 'Serviços';
      if (!mapa.has(c)) mapa.set(c, []);
      mapa.get(c).push(s);
    }
    return [...mapa].map(([nome, itens]) => ({ nome, itens }));
  }, [servicos]);
  return { servicos, categorias };
}

/** Separa a última palavra para o itálico de destaque (Serena). */
export function comDestaque(texto) {
  const partes = String(texto || '').trim().split(/\s+/);
  if (partes.length < 2) return { inicio: '', fim: partes[0] || '' };
  return { inicio: partes.slice(0, -1).join(' ') + ' ', fim: partes.at(-1) };
}

export const Preco = ({ s }) => (s.preco != null
  ? <span className="md-preco">{brl(s.preco)}</span>
  : <span className="md-consulta">Sob consulta</span>);

/** Uma imagem de serviço, ou — sem foto — a inicial sobre a cor da empresa. Nunca foto de banco. */
export function FotoServico({ s, className = 'md-foto' }) {
  return (
    <div className={className}>
      {s.foto
        ? <img src={s.foto} alt="" loading="lazy" />
        : <span className="md-inicial" aria-hidden="true">{s.nome.trim()[0]?.toUpperCase()}</span>}
    </div>
  );
}

/** Filtro por categoria, quando a empresa separa por categoria e tem mais de uma. */
export function useFiltro(categorias, exibir) {
  const usar = exibir?.categorias !== false && categorias.length > 1;
  const [ativa, setAtiva] = useState(null);
  const visiveis = !usar || !ativa ? categorias.flatMap(c => c.itens) : categorias.find(c => c.nome === ativa)?.itens || [];
  const Abas = ({ className = 'md-abas' }) => (usar ? (
    <div className={className} role="tablist" aria-label="Categorias">
      {[null, ...categorias.map(c => c.nome)].map(nome => (
        <button key={nome || 'todas'} role="tab" aria-selected={ativa === nome}
                className={ativa === nome ? 'on' : ''} onClick={() => setAtiva(nome)}>
          {nome || 'Todos'}
        </button>
      ))}
    </div>
  ) : null);
  return { visiveis, Abas };
}

/** Promoção em cartão: o que vem dentro, o preço cheio riscado e quanto economiza. */
export function CartaoPromo({ c, exibir, aoAgendar, className = 'md-promo' }) {
  return (
    <article className={className}>
      <span className="md-selo"><Sparkles size={13} /> Promoção</span>
      <h3>{c.nome}</h3>
      <p className="md-promo-itens">{c.servicos.map(s => s.nome).join(' + ')}</p>
      <p className="md-promo-precos">
        <s>{brl(c.precoCheio)}</s> <strong>{brl(c.preco)}</strong>
      </p>
      <p className="md-promo-eco">
        economize {brl(c.economia)}
        {exibir?.duracao && <> · {duracaoTexto(c.duracao)} no total</>}
      </p>
      {quandoVale(c) && <p className="md-promo-quando">{quandoVale(c)}</p>}
      <button className="b b-p b-peq" onClick={() => aoAgendar(c.id)}>
        <Calendar size={15} /> Aproveitar
      </button>
    </article>
  );
}

/** A equipe que a empresa escolheu mostrar (Site da cliente → Equipe). */
export function Equipe({ equipe, className = 'md-equipe' }) {
  if (!equipe?.length) return null;
  return (
    <div className={className}>
      {equipe.map((p, i) => (
        <Revela key={p.id} className={`atraso-${Math.min(i, 5)}`}>
          <article className="md-pessoa">
            <div className="md-pessoa-foto" style={p.cor ? { '--cor-pessoa': p.cor } : undefined}>
              {p.foto ? <img src={p.foto} alt={`Foto de ${p.nome}`} loading="lazy" />
                : <span aria-hidden="true">{p.nome.trim()[0]?.toUpperCase()}</span>}
            </div>
            <h3>{p.nome}</h3>
            {p.descricao && <p>{p.descricao}</p>}
          </article>
        </Revela>
      ))}
    </div>
  );
}

/** Casos de antes e depois, lado a lado. Só os que têm autorização chegam até aqui. */
export function AntesDepois({ casos, className = 'md-casos' }) {
  if (!casos?.length) return null;
  return (
    <div className={className}>
      {casos.map((c, i) => (
        <Revela key={c.antes + i} className={`atraso-${Math.min(i, 5)}`}>
          <figure className="md-caso">
            <div className="md-caso-par">
              <span><img src={c.antes} alt={`Antes${c.titulo ? `: ${c.titulo}` : ''}`} loading="lazy" /><i>Antes</i></span>
              <span><img src={c.depois} alt={`Depois${c.titulo ? `: ${c.titulo}` : ''}`} loading="lazy" /><i>Depois</i></span>
            </div>
            {c.titulo && <figcaption>{c.titulo}</figcaption>}
          </figure>
        </Revela>
      ))}
    </div>
  );
}

/** Avaliações do Google: só existem vindas da conta conectada (ver vitrine). */
export function Avaliacoes({ avaliacoes: a, className = 'md-avaliacoes' }) {
  if (!a) return null;
  return (
    <div className={className}>
      <p className="md-nota">
        <strong>{a.nota.toFixed(1).replace('.', ',')}</strong>
        <span aria-label={`${a.nota} de 5 estrelas`}>
          {[1, 2, 3, 4, 5].map(n => <Star key={n} size={16} fill={n <= Math.round(a.nota) ? 'currentColor' : 'none'} aria-hidden="true" />)}
        </span>
        {a.total} {a.total === 1 ? 'avaliação' : 'avaliações'} no Google
        {a.link && <a href={a.link} target="_blank" rel="noreferrer">Ver todas</a>}
      </p>
      {a.lista.length > 0 && (
        <div className="md-depoimentos">
          {a.lista.slice(0, 3).map((r, i) => (
            <Revela key={i}><blockquote><p>“{r.texto}”</p><cite>{r.autor}</cite></blockquote></Revela>
          ))}
        </div>
      )}
    </div>
  );
}

/** Perguntas frequentes em <details>: abrem sem JavaScript e o buscador lê a resposta. */
export function Perguntas({ faq, negocio, className = 'md-faq' }) {
  if (!faq?.length) return null;
  const zap = linkGeral(negocio, 'Olá! Vim pelo site e fiquei com uma dúvida.');
  return (
    <div className={className}>
      {faq.map(p => (
        <details key={p.pergunta} className="md-faq-item">
          <summary><span>{p.pergunta}</span><Plus size={17} aria-hidden="true" /></summary>
          <p>{p.resposta}</p>
        </details>
      ))}
      {zap && (
        <p className="md-faq-pe">
          Ficou com outra dúvida? <a href={zap} target="_blank" rel="noreferrer">Pergunte no WhatsApp</a>.
        </p>
      )}
    </div>
  );
}

/** Publicações do Instagram: só as que a empresa (ou a conta conectada) pôs ali. */
export function Publicacoes({ negocio, posts, className = 'md-insta' }) {
  if (!negocio.instagram) return null;
  const arroba = negocio.instagram.replace('@', '');
  const perfil = `https://instagram.com/${arroba}`;
  return (
    <div className={className}>
      {posts?.length > 0 && (
        <div className="md-insta-grade">
          {posts.slice(0, 6).map((p, i) => (
            <a key={p.imagem + i} href={p.link || perfil} target="_blank" rel="noreferrer"
               aria-label={`Publicação ${i + 1} no Instagram`}>
              <img src={p.imagem} alt="" loading="lazy" />
            </a>
          ))}
        </div>
      )}
      <a className="md-insta-perfil" href={perfil} target="_blank" rel="noreferrer">
        <Instagram size={16} /> @{arroba}
      </a>
    </div>
  );
}

/** Endereços, WhatsApp, Instagram, horário e pagamento — o miolo de todo rodapé. */
export function Contato({ dados, negocio, mostrarPagamento }) {
  const NOMES_PAG = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' };
  return (
    <div className="md-contato">
      {lugares(dados).map(l => (
        <a key={l.id || 'sede'} href={l.mapa} target="_blank" rel="noreferrer">
          <MapPin size={16} /><span>{l.nome && <b>{l.nome} · </b>}{l.endereco}</span>
        </a>
      ))}
      {negocio.whatsapp && (
        <a href={`https://wa.me/55${soDigitos(negocio.whatsapp)}`} target="_blank" rel="noreferrer">
          <MessageCircle size={16} /><span>WhatsApp</span>
        </a>
      )}
      {negocio.fone && negocio.fone !== negocio.whatsapp && (
        <a href={`tel:${soDigitos(negocio.fone)}`}>
          <Phone size={16} /><span>{negocio.fone}</span>
        </a>
      )}
      {negocio.instagram && (
        <a href={`https://instagram.com/${negocio.instagram.replace('@', '')}`} target="_blank" rel="noreferrer">
          <Instagram size={16} /><span>@{negocio.instagram.replace('@', '')}</span>
        </a>
      )}
      <Horarios horarios={negocio.horarios} />
      {mostrarPagamento && negocio.formasPagamento?.length > 0 && (
        <div className="md-pagamentos">
          {negocio.formasPagamento.map(f => <span key={f}>{NOMES_PAG[f] || f}</span>)}
        </div>
      )}
    </div>
  );
}

/**
 * O mapa de cada endereço (chave "Mapa" no painel). Embed do Google Maps sem
 * chave de API, só com o endereço da própria empresa — um por unidade, como
 * na Clínica: a cliente quer ver onde fica a loja aonde ela vai.
 */
export function Mapas({ dados, className = 'md-mapas' }) {
  const onde = lugares(dados);
  if (!onde.length) return null;
  return (
    <div className={className + (onde.length > 1 ? ' md-mapas-varios' : '')}>
      {onde.map(l => (
        <Revela key={l.id || 'sede'}>
          <figure className="md-mapa">
            <div className="md-mapa-caixa">
              <iframe title={`Localização no mapa${l.nome ? ` — ${l.nome}` : ''}`}
                      src={`https://www.google.com/maps?q=${encodeURIComponent(l.endereco)}&output=embed`}
                      loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
            </div>
            <figcaption>
              <MapPin size={16} aria-hidden="true" />
              <span>{l.nome && <b>{l.nome} · </b>}{l.endereco}</span>
              <a href={l.mapa} target="_blank" rel="noreferrer">Como chegar</a>
            </figcaption>
          </figure>
        </Revela>
      ))}
    </div>
  );
}

/** A primeira linha do horário, para um destaque curto ("Seg a sáb · 09:00 às 19:00"). */
export function horarioCurto(horarios = []) {
  if (!horarios.length) return null;
  const dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const h = horarios[0];
  const iguais = horarios.filter(x => x.abre === h.abre && x.fecha === h.fecha);
  const faixa = iguais.length > 1 ? `${dias[iguais[0].dia]} a ${dias[iguais.at(-1).dia]}` : dias[h.dia];
  return `${faixa[0].toUpperCase()}${faixa.slice(1)} · ${h.abre} às ${h.fecha}`;
}

/** A linha de baixo de todo rodapé: o texto que a empresa escreveu (ou o nome) e a política. */
export function Assinatura({ dados }) {
  return (
    <div className="md-env md-assinatura">
      <span>{dados.textos?.rodape || dados.negocio.nome}</span>
      <a href="#privacidade">Política de privacidade</a>
    </div>
  );
}

export { Revela, PerguntarSobre, Clock, duracaoTexto, brl };
