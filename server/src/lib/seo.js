/**
 * O `<head>` do site de cada empresa, escrito no servidor.
 *
 * O site é montado no navegador, e `web/src/site/seo.js` escreve título e
 * descrição depois que a vitrine responde. O Google roda JavaScript e enxerga;
 * a **prévia de link do WhatsApp e do Instagram não roda** — lê só o HTML que
 * chega, e mostrava "Agende seu horário" para toda empresa. É justamente o
 * caso da empresa mandando o próprio site para a cliente.
 *
 * `titulo` e `descricao` repetem as regras de `web/src/site/seo.js`: em
 * produção o container leva o servidor e o `web/dist`, não o código-fonte do
 * front, então não há como importar de lá. **Mudou uma, mude a outra** — no
 * navegador, a do site escreve por cima desta com o mesmo resultado.
 */

const MAX_TITULO = 65;
const MAX_DESCRICAO = 155;

const listaCurta = itens => {
  if (!itens.length) return '';
  if (itens.length === 1) return itens[0];
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
};

/** "Laura Faust — Sobrancelhas, Unhas e Cílios em Joinville" */
export function titulo(cfg, servicos) {
  const nome = cfg.nome || 'Agende seu horário';
  const emCidade = cfg.cidade ? ` em ${cfg.cidade}` : '';
  const assuntos = [...new Set(servicos.map(s => s.categoria).filter(Boolean))];
  const lista = listaCurta((assuntos.length ? assuntos : servicos.map(s => s.nome)).slice(0, 3));
  const cheio = lista ? `${nome} — ${lista}${emCidade}` : `${nome}${emCidade}`;
  return cheio.length <= MAX_TITULO ? cheio : `${nome}${emCidade}`.slice(0, MAX_TITULO);
}

export function descricao(cfg, servicos) {
  const partes = [];
  if (cfg.sobre) partes.push(cfg.sobre.trim());
  else if (cfg.slogan) partes.push(cfg.slogan.trim());

  const nomes = listaCurta([...new Set(servicos.map(s => s.categoria).filter(Boolean))].slice(0, 3));
  if (nomes) {
    const jaFalou = cfg.cidade && partes.join(' ').toLowerCase().includes(cfg.cidade.toLowerCase());
    partes.push(`${nomes}${cfg.cidade && !jaFalou ? ` em ${cfg.cidade}` : ''}.`);
  }
  partes.push('Agende online, com horário confirmado na hora.');

  const texto = partes.join(' ').replace(/\s+/g, ' ');
  if (texto.length <= MAX_DESCRICAO) return texto;
  const cortado = texto.slice(0, MAX_DESCRICAO - 1);
  return cortado.slice(0, cortado.lastIndexOf(' ')).trimEnd().replace(/[,.;:—-]$/, '') + '…';
}

const escapar = t => String(t ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * O `index.html` do build com o `<head>` da empresa. Tudo que vem da config
 * passa por `escapar`: o nome do negócio é texto livre, e sem isso um `"` ou um
 * `<script>` no nome viraria HTML na página de todo visitante.
 */
export function comCabecalho(html, { cfg, servicos, origem }) {
  const t = titulo(cfg, servicos);
  const d = descricao(cfg, servicos);
  const img = cfg.marca?.capa || cfg.marca?.logo;
  const imagem = img ? (img.startsWith('http') ? img : `${origem}${img}`) : '';

  const metas = [
    `<meta property="og:title" content="${escapar(t)}" />`,
    `<meta property="og:description" content="${escapar(d)}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:url" content="${escapar(origem + '/')}" />`,
    `<meta property="og:site_name" content="${escapar(cfg.nome)}" />`,
    ...(imagem ? [
      `<meta property="og:image" content="${escapar(imagem)}" />`,
      '<meta name="twitter:card" content="summary_large_image" />',
    ] : []),
  ].join('\n    ');

  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${escapar(t)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${escapar(d)}" />`)
    .replace('</head>', `    ${metas}\n  </head>`);
}
