/**
 * O que os buscadores leem da página.
 *
 * O site é uma página só, montada no navegador: sem isto, todas as empresas
 * dividiriam o `<title>` do `index.html` e nenhuma delas apareceria numa busca
 * por serviço e cidade. Aqui a página ganha título, descrição e um bloco
 * JSON-LD de negócio local com endereço, telefone e horário de atendimento.
 *
 * **Nada aqui inventa dado.** Cada campo só entra quando a empresa cadastrou o
 * que ele descreve — endereço sem cidade sai sem `addressLocality`, negócio
 * sem telefone sai sem `telephone`. Schema com dado errado é pior que schema
 * nenhum: é a busca mostrando o endereço errado do negócio de alguém.
 *
 * `LocalBusiness` e não um tipo mais específico (`HealthAndBeautySalon`,
 * `HairSalon`...): o ramo é texto livre de cada empresa, e escolher por
 * palavra-chave erraria justamente em quem não é do ramo que a gente conhece.
 */

const MAX_TITULO = 65;
const MAX_DESCRICAO = 155;

/** Domingo = 0, na ordem que o schema.org espera. */
const DIAS_SCHEMA = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function aplicarSeo(dados, lugares = []) {
  const { negocio, marca, servicos = [], faq = [] } = dados;

  document.title = titulo(dados);
  meta('description', descricao(dados));
  // Quem compartilha o link no WhatsApp ou no Instagram vê isto, não o <title>.
  meta('og:title', document.title, 'property');
  meta('og:description', descricao(dados), 'property');
  meta('og:type', 'website', 'property');
  if (marca?.capa || marca?.logo) meta('og:image', absoluta(marca.capa || marca.logo), 'property');

  const blocos = [negocioLocal(dados, lugares)];
  if (faq.length) blocos.push(perguntasFrequentes(faq));
  jsonLd(blocos);
}

/** "Laura Faust — Sobrancelhas, Unhas e Cílios em Joinville" */
function titulo({ negocio, servicos = [] }) {
  const nome = negocio.nome || 'Agende seu horário';
  const emCidade = negocio.cidade ? ` em ${negocio.cidade}` : '';

  // As categorias dizem o que o negócio faz em duas ou três palavras; a lista
  // de serviços diria a mesma coisa em vinte. Sem categoria, os serviços.
  const assuntos = [...new Set(servicos.map(s => s.categoria).filter(Boolean))];
  const lista = listaCurta((assuntos.length ? assuntos : servicos.map(s => s.nome)).slice(0, 3));

  const cheio = lista ? `${nome} — ${lista}${emCidade}` : `${nome}${emCidade}`;
  return cheio.length <= MAX_TITULO ? cheio : `${nome}${emCidade}`.slice(0, MAX_TITULO);
}

function descricao({ negocio, servicos = [] }) {
  const partes = [];
  // O texto da empresa vem primeiro: é ela falando, não nós resumindo.
  if (negocio.sobre) partes.push(negocio.sobre.trim());
  else if (negocio.slogan) partes.push(negocio.slogan.trim());

  const nomes = listaCurta([...new Set(servicos.map(s => s.categoria).filter(Boolean))].slice(0, 3));
  if (nomes) {
    // A cidade só entra se o texto da empresa já não a tiver dito — slogan
    // como "Corte e barba · Joinville" fazia a descrição repetir a cidade
    // duas vezes em duas linhas.
    const jaFalou = negocio.cidade && partes.join(' ').toLowerCase().includes(negocio.cidade.toLowerCase());
    partes.push(`${nomes}${negocio.cidade && !jaFalou ? ` em ${negocio.cidade}` : ''}.`);
  }
  partes.push('Agende online, com horário confirmado na hora.');

  const texto = partes.join(' ').replace(/\s+/g, ' ');
  if (texto.length <= MAX_DESCRICAO) return texto;
  // Corta na palavra inteira: "sem fórmula pron…" é pior que uma frase curta.
  const cortado = texto.slice(0, MAX_DESCRICAO - 1);
  return cortado.slice(0, cortado.lastIndexOf(' ')).trimEnd().replace(/[,.;:—-]$/, '') + '…';
}

/** ['a','b','c'] → 'a, b e c' */
function listaCurta(itens) {
  if (!itens.length) return '';
  if (itens.length === 1) return itens[0];
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

function negocioLocal({ negocio, marca, servicos = [] }, lugares) {
  const [principal, ...outros] = lugares;

  const dados = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: negocio.nome,
    url: location.origin,
  };

  if (negocio.sobre) dados.description = negocio.sobre;
  if (marca?.capa || marca?.logo) dados.image = absoluta(marca.capa || marca.logo);
  if (marca?.logo) dados.logo = absoluta(marca.logo);
  if (negocio.fone || negocio.whatsapp) dados.telephone = `+55${soNumeros(negocio.fone || negocio.whatsapp)}`;
  if (negocio.instagram) dados.sameAs = [`https://instagram.com/${negocio.instagram.replace('@', '')}`];

  if (principal) {
    dados.address = endereco(principal.endereco, negocio.cidade);
    // Mais de um endereço: o primeiro é o do schema e os outros entram como
    // `location`. Um `LocalBusiness` tem um endereço só — repetir o bloco
    // inteiro por loja faria a busca entender duas empresas de mesmo nome.
    if (outros.length) {
      dados.location = outros.map(l => ({
        '@type': 'Place', name: l.nome || undefined, address: endereco(l.endereco, negocio.cidade),
      }));
    }
  }

  const horarios = negocio.horarios || [];
  if (horarios.length) {
    dados.openingHoursSpecification = horarios.map(h => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: `https://schema.org/${DIAS_SCHEMA[h.dia]}`,
      opens: h.abre, closes: h.fecha,
    }));
  }

  // Só com preço visível: a empresa que escondeu preço no painel não o publica
  // por uma porta de trás.
  const comPreco = servicos.filter(s => s.preco != null);
  if (comPreco.length) {
    dados.priceRange = `R$ ${Math.min(...comPreco.map(s => s.preco))} - R$ ${Math.max(...comPreco.map(s => s.preco))}`;
  }
  if (servicos.length) {
    dados.hasOfferCatalog = {
      '@type': 'OfferCatalog',
      name: 'Serviços',
      itemListElement: servicos.map(s => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: s.nome, ...(s.descricao ? { description: s.descricao } : {}) },
        ...(s.preco != null ? { price: String(s.preco), priceCurrency: 'BRL' } : {}),
      })),
    };
  }

  return dados;
}

function endereco(linha, cidade) {
  const saida = { '@type': 'PostalAddress', streetAddress: linha, addressCountry: 'BR' };
  if (cidade) saida.addressLocality = cidade;
  return saida;
}

const perguntasFrequentes = faq => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faq.map(p => ({
    '@type': 'Question',
    name: p.pergunta,
    acceptedAnswer: { '@type': 'Answer', text: p.resposta },
  })),
});

/* ── mexer no <head> ── */

function meta(nome, conteudo, atributo = 'name') {
  if (!conteudo) return;
  let tag = document.head.querySelector(`meta[${atributo}="${nome}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(atributo, nome);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', conteudo);
}

/** Um bloco só, reescrito a cada chamada — nunca dois schemas do mesmo negócio. */
function jsonLd(blocos) {
  let tag = document.getElementById('dados-estruturados');
  if (!tag) {
    tag = document.createElement('script');
    tag.type = 'application/ld+json';
    tag.id = 'dados-estruturados';
    document.head.appendChild(tag);
  }
  tag.textContent = JSON.stringify(blocos.length === 1 ? blocos[0] : blocos);
}

const soNumeros = t => String(t || '').replace(/\D/g, '');
const absoluta = url => (url?.startsWith('http') ? url : `${location.origin}${url || ''}`);
