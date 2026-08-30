/**
 * A marca vem do banco, não do CSS.
 *
 * O `styles.css` do site só usa variáveis; os valores chegam aqui, em runtime,
 * a partir da config da empresa. Um CSS, N marcas, nenhum rebuild por cliente —
 * é o que permite a mesma base servir um estúdio de estética e uma barbearia.
 */

/** Mistura um hex em direção a um alvo. `q` de -1 a 1 é a força da mistura;
    sem `alvo`, a direção é preto (q negativo) ou branco (q positivo) — o
    caso de sempre, em modelo de fundo claro. Um modelo de fundo escuro passa
    o próprio fundo como alvo: clarear "em direção ao branco" pintaria uma
    mancha branca em cima do escuro, em vez de uma variação discreta dele.
    Devolve hex (não rgb()), porque `contraste()` precisa reprocessar o
    resultado — a cor do hover é escurecida, não é a mesma da original. */
function mistura(hex, q, alvo = null) {
  const n = parseInt((hex || '#000000').slice(1), 16);
  const alvoN = alvo ? parseInt(alvo.slice(1), 16) : (q > 0 ? 0xFFFFFF : 0x000000);
  const p = Math.abs(q);
  const canal = deslocamento => {
    const v = (n >> deslocamento) & 255;
    const av = (alvoN >> deslocamento) & 255;
    return Math.round(v + (av - v) * p);
  };
  const doisDigitos = v => v.toString(16).padStart(2, '0');
  return `#${doisDigitos(canal(16))}${doisDigitos(canal(8))}${doisDigitos(canal(0))}`;
}

/** Luminância relativa do WCAG (não a percebida): cada canal passa por
    correção de gama antes de entrar na soma, senão a comparação com o preto
    e o branco do próximo passo não bate com o contraste que o navegador
    realmente calcula. */
function luminanciaRelativa(hex) {
  const n = parseInt((hex || '#000000').slice(1), 16);
  const canal = c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}

function razaoDeContraste(a, b) {
  const clara = Math.max(a, b), escura = Math.min(a, b);
  return (clara + 0.05) / (escura + 0.05);
}

/** Clareia (ou escurece) `hex` em passos até bater `minimo` de contraste
    contra `fundo`, sem passar de um teto. Cobre o caso de `--marca` usada
    como texto puro — link em hover, "obrigatório" do formulário, a economia
    da promoção — em cerca de quinze lugares do CSS. Numa página clara isso
    quase sempre já dava certo, porque toda cor escolhida contrasta com
    branco; num modelo de fundo escuro, uma marca escura ou de meio-tom
    (o verde e o rosa que este produto já usou como padrão, por exemplo)
    ficava abaixo de 3:1, ilegível. */
function comContraste(hex, fundo, minimo = 3) {
  if (razaoDeContraste(luminanciaRelativa(hex), luminanciaRelativa(fundo)) >= minimo) return hex;
  const alvo = luminanciaRelativa(fundo) > 0.5 ? '#000000' : '#FFFFFF';
  let melhor = hex;
  for (let p = 0.1; p <= 0.9; p += 0.1) {
    melhor = mistura(hex, p, alvo);
    if (razaoDeContraste(luminanciaRelativa(melhor), luminanciaRelativa(fundo)) >= minimo) return melhor;
  }
  return melhor;
}

/** Preto ou branco por cima da cor da marca, o que tiver mais contraste —
    pela fórmula de contraste do WCAG, não por um limiar de luminância
    aproximado. Não garante 4,5:1 para toda cor possível (com preto e branco
    só, uma marca de meio-tom pode não ter opção boa), mas nunca escolhe a
    pior das duas opções. */
function contraste(hex) {
  const luz = luminanciaRelativa(hex);
  const comPreto = razaoDeContraste(luz, luminanciaRelativa('#1A1A1A'));
  const comBranco = razaoDeContraste(luz, luminanciaRelativa('#FFFFFF'));
  return comPreto >= comBranco ? '#1A1A1A' : '#FFFFFF';
}

/** Escurece `hex` em passos até ele mesmo aguentar texto branco em cima, com
    folga (`minimo`, 4,5:1 por padrão). É o que separa "cor de acento" de "cor
    de preenchimento cheio": metade das cores que uma empresa escolhe (um
    verde-sálvia claro, um rosa pastel) não sustenta branco na própria
    intensidade — `contraste()` então cai para preto, e todo botão/selo/dia
    selecionado feito de --marca+--sobre-marca lê como "texto preto comum",
    sem cara de marca nenhuma. Uma cor já escura o bastante (a maioria dos
    azuis-marinho, verdes escuros) sai quase igual — o laço para no primeiro
    passo que já resolve. */
function paraTextoBranco(hex, minimo = 4.5) {
  if (razaoDeContraste(luminanciaRelativa(hex), luminanciaRelativa('#FFFFFF')) >= minimo) return hex;
  let escuro = hex;
  for (let p = 0.15; p <= 0.9; p += 0.15) {
    escuro = mistura(hex, -p);
    if (razaoDeContraste(luminanciaRelativa(escuro), luminanciaRelativa('#FFFFFF')) >= minimo) return escuro;
  }
  return escuro;
}

/**
 * Fonte de cada modelo — só a do modelo ativo é carregada, para não pedir
 * quatro famílias de fonte numa aba só. `bandeja` mora no @import fixo do
 * styles.css (é o modelo padrão, precisa estar pronta antes de qualquer
 * config chegar), então não entra aqui.
 */
const FONTES = {
  quadro: 'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap',
  caderneta: 'https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&family=Caveat:wght@600;700&display=swap',
  clinica: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=Tenor+Sans&display=swap',
};

function carregarFonte(template) {
  const url = FONTES[template];
  const l = document.getElementById('fonte-modelo') || document.createElement('link');
  l.id = 'fonte-modelo';
  l.rel = 'stylesheet';
  // Sem fonte própria (bandeja): o link some, sem pedido de rede à toa.
  if (!url) { l.remove(); return; }
  l.href = url;
  document.head.appendChild(l);
}

/** O `--fundo` de cada modelo, igual ao que `[data-template="..."]` grava em
    styles.css — precisa ser o mesmo valor nos dois lugares. É só JS que
    calcula contraste; a fonte visual continua sendo o CSS. Mudou o fundo de
    um modelo lá? Muda aqui também. */
const FUNDOS = {
  bandeja: '#FFFFFF',
  quadro: '#1C1F1D',
  caderneta: '#F1E9DA',
  clinica: '#FFFFFF',
};
const CLAROS = new Set(['bandeja', 'clinica']); // fundo claro: mistura em direção ao branco vale como já era

export function aplicarTema(marca = {}) {
  const primaria = marca.corPrimaria || '#A32A4E';
  const template = marca.template || 'bandeja';
  const r = document.documentElement.style;
  const fundo = FUNDOS[template] || '#FFFFFF';
  // Fundo claro o bastante para a mistura em direção ao branco continuar
  // válida (kraft da Caderneta é "claro" nesse sentido, mesmo não sendo
  // branco puro); só um fundo de verdade escuro precisa mudar de direção.
  const alvoEscuro = CLAROS.has(template) || luminanciaRelativa(fundo) > 0.4 ? null : fundo;

  // Não é mais um -25% fixo: escurece só o quanto for preciso para a própria
  // cor aguentar texto branco. --marca-escura vira o "preenchimento cheio" do
  // site (botão primário, cartão de destaque, dia selecionado) — --marca
  // continua a cor exata da empresa, para acento, borda e ícone.
  const escura = paraTextoBranco(primaria);

  // Só a cor de destaque e seus vizinhos próximos — nunca o fundo nem o
  // texto da página. Fundo, texto e a linha são donos do modelo (ver
  // [data-template="..."] em styles.css): um modelo escuro não pode herdar
  // "fundo branco" de um campo que hoje nem tem tela no painel para ser
  // mudado.
  const clara = mistura(primaria, alvoEscuro ? 0.55 : 0.88, alvoEscuro);

  r.setProperty('--marca', primaria);
  r.setProperty('--marca-escura', escura);
  r.setProperty('--marca-clara', clara);
  r.setProperty('--marca-borda', mistura(primaria, 0.72));
  r.setProperty('--marca-fundo', mistura(primaria, alvoEscuro ? 0.35 : 0.94, alvoEscuro));
  r.setProperty('--sobre-marca', contraste(primaria));
  // Por construção `escura` já aguenta branco (é o que `paraTextoBranco`
  // garante); recalcula por `contraste()` mesmo assim, e não fixa branco na
  // marra, para o caso extremo em que nem o escurecimento máximo resolve.
  r.setProperty('--sobre-marca-escura', contraste(escura));
  // A inicial do círculo de serviço prefere a própria cor da marca — é o
  // efeito bonito, "a cor da empresa dentro do círculo dela". Mas --marca e
  // --marca-clara vêm da mesma matiz, e para uma marca já muito clara (um
  // amarelo pastel, por exemplo) ou para modelo de fundo escuro, a própria
  // cor em cima da própria variação clara cai abaixo de 3:1. `comContraste`
  // preserva a cor quando já lê bem e só ajusta quando não lê.
  r.setProperty('--sobre-marca-clara', comContraste(primaria, clara, 3));
  // A própria marca, usada como texto puro (link em hover, "obrigatório" do
  // formulário, a economia da promoção) — em cerca de quinze lugares do CSS.
  // Clareada só o suficiente para continuar lendo como "a cor da empresa" e
  // não virar branco, mas nunca abaixo de 3:1 contra o fundo do modelo.
  r.setProperty('--marca-legivel', comContraste(primaria, fundo, 3));

  document.documentElement.dataset.template = template;
  carregarFonte(template);

  if (marca.favicon) {
    const l = document.querySelector('link[rel="icon"]') || document.createElement('link');
    l.rel = 'icon';
    l.href = marca.favicon;
    document.head.appendChild(l);
  }
}
