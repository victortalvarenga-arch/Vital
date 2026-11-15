import crypto from 'node:crypto';

/**
 * "Entrar com Google" da **cliente** — não da equipe, e não da empresa.
 *
 * São três coisas diferentes no projeto, e misturá-las é fácil:
 *
 * | | Quem autoriza | Para quê | Onde mora |
 * |---|---|---|---|
 * | Conexão Google | a dona da empresa | ler as avaliações da ficha dela | `conexoes/google.js` |
 * | Login Google | a cliente que agenda | não digitar o número de novo | aqui |
 * | Login do painel | a equipe | entrar no painel | `lib/auth.js` |
 *
 * A conexão pede o escopo `business.manage`, que é **sensível** e prende a
 * tela de consentimento em modo Teste até o app ser verificado. Este login
 * pede só `openid/email/profile`, que não é sensível — por isso os dois usam
 * **clientes OAuth separados**, e aqui a variável é `GOOGLE_LOGIN_CLIENT_ID`,
 * nunca a `GOOGLE_CLIENT_ID` das avaliações. Juntá-los faria o login da
 * cliente herdar a fila de verificação do outro.
 *
 * **O navegador manda um token; o servidor não acredita em mais nada.** Nome,
 * e-mail e id da conta saem de dentro do token já conferido. Campo solto no
 * corpo da requisição (`{"email": "..."}`) é entrar como qualquer pessoa.
 *
 * **Conferido aqui, não perguntado ao Google.** O `tokeninfo` deles resolveria
 * em uma chamada, mas seria uma ida à rede no caminho de entrar — lenta, com
 * limite de uso, e um fora do ar deles vira um login fora do ar aqui. O
 * certificado público é buscado uma vez e reaproveitado; o que decide é a
 * conta da matemática.
 */

const CERTS = 'https://www.googleapis.com/oauth2/v3/certs';

/** O Google emite com as duas formas, e as duas são dele. */
const EMISSORES = new Set(['accounts.google.com', 'https://accounts.google.com']);

/** Relógio de servidor erra alguns segundos; um minuto cobre sem abrir porta. */
const FOLGA_S = 60;

/**
 * **A requisição inteira segura uma conexão do banco** (`db.naRequisicao` abre
 * a transação antes do handler), e o pool tem dez. Uma ida à rede sem prazo
 * aqui dentro é uma conexão parada pelo tempo que o Google demorar — e esta é
 * rota pública e anônima. Com prazo, o pior caso é um 401 em cinco segundos;
 * sem ele, um punhado de pedidos derruba o painel e o site de TODAS as
 * empresas. Achado do `revisor-isolamento`, 2026-11-14.
 */
const PRAZO_REDE_MS = 5000;

/**
 * Teto de uma busca por minuto quando o `kid` é desconhecido.
 *
 * O `kid` é lido do cabeçalho do token ANTES de qualquer conferência — é ele
 * que diz qual chave usar. Sem este freio, um token com `kid` sorteado a cada
 * pedido força uma ida à rede por requisição, de graça, de fora. O Google troca
 * de chave raramente; um minuto de espera numa troca não custa nada.
 */
const ESPERA_ENTRE_BUSCAS_MS = 60_000;

export const loginGoogleConfigurado = () => !!process.env.GOOGLE_LOGIN_CLIENT_ID;

let cache = { ate: 0, chaves: new Map(), proxima: 0 };

/** Só para teste: a próxima conferência busca o certificado de novo. */
export const esquecerChaves = () => { cache = { ate: 0, chaves: new Map(), proxima: 0 }; };

/**
 * As chaves públicas do Google, guardadas pelo prazo que eles mesmos mandam.
 *
 * Eles trocam de chave de tempos em tempos, e o token novo vem com um `kid`
 * que ainda não está aqui — daí a busca de novo quando o `kid` é desconhecido.
 */
async function chavePor(kid) {
  if (cache.ate > Date.now() && cache.chaves.has(kid)) return cache.chaves.get(kid);
  if (Date.now() < cache.proxima) {
    throw new Error('o token foi assinado com uma chave que o Google não publica');
  }

  const r = await fetch(CERTS, { signal: AbortSignal.timeout(PRAZO_REDE_MS) });
  if (!r.ok) throw new Error('não consegui falar com o Google para conferir a assinatura');
  const { keys = [] } = await r.json();

  const prazo = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  // As novas entram sem derrubar as que já estavam: o Google serve as duas
  // durante uma troca, e apagar o mapa faria o token legítimo de um minuto
  // atrás virar "chave que não existe".
  const chaves = new Map(cache.chaves);
  for (const k of keys) if (k.kid) chaves.set(k.kid, k);
  cache = {
    ate: Date.now() + (prazo ? Number(prazo[1]) : 3600) * 1000,
    chaves,
    proxima: Date.now() + ESPERA_ENTRE_BUSCAS_MS,
  };

  const achada = chaves.get(kid);
  if (!achada) throw new Error('o token foi assinado com uma chave que o Google não publica');
  return achada;
}

const pedaco = texto => JSON.parse(Buffer.from(texto, 'base64url').toString('utf8'));

/**
 * Confere o ID token e devolve quem a cliente é, ou lança.
 *
 * Lança em vez de devolver `null` de propósito: a rota precisa escolher a
 * mensagem, e um `null` esquecido num `if` vira login aceito.
 *
 * @param {string} bruto o `credential` que o Google entrega ao navegador
 * @returns {Promise<{sub: string, email: string, nome: string}>}
 */
export async function conferirIdToken(bruto) {
  const nosso = process.env.GOOGLE_LOGIN_CLIENT_ID || '';
  if (!nosso) throw new Error('o login com Google não está configurado neste servidor');

  const partes = String(bruto || '').split('.');
  if (partes.length !== 3 || !partes[0] || !partes[1]) throw new Error('token malformado');

  let cabecalho, corpo;
  try {
    cabecalho = pedaco(partes[0]);
    corpo = pedaco(partes[1]);
  } catch {
    throw new Error('token malformado');
  }

  // `alg` vem de dentro do próprio token, então ele não escolhe nada: a lista
  // é nossa. Aceitar o que o token pede é como deixar o cadeado dizer que não
  // precisa de chave — é assim que `alg: none` vira login de graça.
  if (cabecalho.alg !== 'RS256') throw new Error('algoritmo de assinatura não aceito');
  if (!partes[2]) throw new Error('token sem assinatura');

  const jwk = await chavePor(cabecalho.kid);
  const chave = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const assinado = Buffer.from(`${partes[0]}.${partes[1]}`);
  const assinatura = Buffer.from(partes[2], 'base64url');
  if (!crypto.verify('RSA-SHA256', assinado, chave, assinatura)) {
    throw new Error('assinatura do token não confere');
  }

  // A partir daqui o conteúdo é mesmo do Google. Falta saber se é para nós.
  if (!EMISSORES.has(corpo.iss)) throw new Error('emissor do token não é o Google');

  // `aud` pode vir como texto ou lista. É a conferência que separa "token do
  // Google" de "token para a Vital".
  const alvos = Array.isArray(corpo.aud) ? corpo.aud : [corpo.aud];
  if (!alvos.includes(nosso)) throw new Error('o token é de outro aplicativo');

  const agora = Math.floor(Date.now() / 1000);
  if (!corpo.exp || corpo.exp + FOLGA_S < agora) throw new Error('o token venceu');
  if (corpo.iat && corpo.iat - FOLGA_S > agora) throw new Error('o token foi emitido no futuro');

  // Conta do Google com e-mail não confirmado não prova quem é dono dele.
  if (corpo.email_verified !== true) throw new Error('o e-mail dessa conta não foi confirmado no Google');
  if (!corpo.sub || !corpo.email) throw new Error('o token não traz conta nem e-mail');

  return {
    sub: String(corpo.sub),
    email: String(corpo.email).toLowerCase(),
    nome: String(corpo.name || '').trim(),
  };
}
