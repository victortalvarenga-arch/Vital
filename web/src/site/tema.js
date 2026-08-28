/**
 * A marca vem do banco, não do CSS.
 *
 * O `styles.css` do site só usa variáveis; os valores chegam aqui, em runtime,
 * a partir da config da empresa. Um CSS, N marcas, nenhum rebuild por cliente —
 * é o que permite a mesma base servir um estúdio de estética e uma barbearia.
 */

/** Clareia ou escurece um hex. `q` de -1 (preto) a 1 (branco). */
function mistura(hex, q) {
  const n = parseInt((hex || '#000000').slice(1), 16);
  const alvo = q > 0 ? 255 : 0;
  const p = Math.abs(q);
  const canal = deslocamento => {
    const v = (n >> deslocamento) & 255;
    return Math.round(v + (alvo - v) * p);
  };
  return `rgb(${canal(16)}, ${canal(8)}, ${canal(0)})`;
}

/** Preto ou branco por cima da cor da marca, o que tiver mais contraste. */
function contraste(hex) {
  const n = parseInt((hex || '#000000').slice(1), 16);
  // Luminância percebida: o olho é bem mais sensível ao verde que ao azul.
  const luz = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return luz > 0.6 ? '#1A1A1A' : '#FFFFFF';
}

export function aplicarTema(marca = {}) {
  const primaria = marca.corPrimaria || '#A32A4E';
  const r = document.documentElement.style;

  r.setProperty('--marca', primaria);
  r.setProperty('--marca-escura', mistura(primaria, -0.25));
  r.setProperty('--marca-clara', mistura(primaria, 0.88));
  r.setProperty('--marca-borda', mistura(primaria, 0.72));
  // Fundo de bloco: bem lavado de propósito. A cor da marca varia de cliente
  // para cliente, e texto escuro precisa continuar legível sobre qualquer uma
  // delas — um tom saturado quebraria o contraste para metade das marcas.
  r.setProperty('--marca-fundo', mistura(primaria, 0.94));
  r.setProperty('--sobre-marca', contraste(primaria));
  r.setProperty('--fundo', marca.corFundo || '#FFFFFF');
  r.setProperty('--texto', marca.corTexto || '#1A1A1A');

  if (marca.favicon) {
    const l = document.querySelector('link[rel="icon"]') || document.createElement('link');
    l.rel = 'icon';
    l.href = marca.favicon;
    document.head.appendChild(l);
  }
}
