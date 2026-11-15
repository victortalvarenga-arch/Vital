import crypto from 'node:crypto';

/**
 * As duas coisas que a conexão com Google e Instagram precisa esconder ou
 * provar, a partir de um segredo só (`CONEXOES_SEGREDO`):
 *
 *  1. **Assinar o `state` da autorização.** O Google e a Meta devolvem a
 *     pessoa para UM endereço cadastrado, o mesmo para todas as empresas — não
 *     dá para cadastrar o subdomínio de cada uma. Quem diz de qual empresa é o
 *     retorno é o `state`, e ele passa pela barra de endereço. Sem assinatura,
 *     trocar o id da empresa ali gravaria a conta do Google de uma pessoa na
 *     empresa de outra.
 *  2. **Cifrar os tokens no banco.** Token do Google com `business.manage`
 *     edita a ficha da empresa. Cifrado, um dump do banco não basta.
 *
 * Duas chaves derivadas do mesmo segredo, uma por uso: a chave que assina nunca
 * é a que cifra.
 */

const PRAZO_ESTADO_MS = 15 * 60_000;
const PRAZO_ANIVERSARIO_MS = 30 * 60_000;

function chave(uso) {
  const s = process.env.CONEXOES_SEGREDO || '';
  if (s.length < 32) {
    const erro = new Error('CONEXOES_SEGREDO não definido (mínimo 32 caracteres) — ver server/.env.example');
    erro.status = 503;
    throw erro;
  }
  return Buffer.from(crypto.hkdfSync('sha256', s, 'vital', uso, 32));
}

export const segredoConfigurado = () => (process.env.CONEXOES_SEGREDO || '').length >= 32;

const b64 = buf => Buffer.from(buf).toString('base64url');

/**
 * Papel assinado: dados em base64url + ponto + HMAC.
 *
 * **Uma chave por uso, e o uso entra na derivação.** Papel emitido para uma
 * coisa não vale para outra, mesmo saindo do mesmo segredo: sem isso, o
 * `state` de uma autorização do Google — que passa pela barra de endereço e
 * fica no histórico de quem clicou — seria aceito onde se escreve na ficha da
 * cliente. É assinado, não cifrado: quem tem o papel lê o conteúdo, então ali
 * só vai id, empresa e hora.
 */
const assinar = (uso, dados) => {
  const corpo = b64(JSON.stringify({ ...dados, em: Date.now() }));
  const assinatura = b64(crypto.createHmac('sha256', chave(uso)).update(corpo).digest());
  return `${corpo}.${assinatura}`;
};

const conferir = (uso, papel, prazoMs) => {
  const [corpo, assinatura] = String(papel || '').split('.');
  if (!corpo || !assinatura) return null;
  const esperada = crypto.createHmac('sha256', chave(uso)).update(corpo).digest();
  const recebida = Buffer.from(assinatura, 'base64url');
  // timingSafeEqual exige o mesmo tamanho, e lança se não for.
  if (recebida.length !== esperada.length || !crypto.timingSafeEqual(recebida, esperada)) return null;
  let dados;
  try { dados = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')); } catch { return null; }
  if (!dados?.em || Date.now() - dados.em > prazoMs) return null;
  return dados;
};

/** O `state` da autorização do Google e da Meta. Vence em 15 minutos. */
export const assinarEstado = dados => assinar('estado', dados);

/** Os dados do `state`, ou `null` se foi mexido ou venceu. */
export const conferirEstado = estado => conferir('estado', estado, PRAZO_ESTADO_MS);

/**
 * O convite para informar o aniversário, entregue na tela de "horário
 * confirmado". Meia hora: é o tempo de ela ler a confirmação e responder, e
 * curto o bastante para o papel não virar uma chave eterna no histórico do
 * navegador.
 *
 * **Cifrado, e não assinado** — é a diferença entre este papel e o `state` do
 * OAuth. Papel assinado é legível por quem o tem na mão: o primeiro desenho
 * levava o id da ficha em base64, e ele saía em claro em toda confirmação de
 * agendamento (achado do `revisor-isolamento`, 2026-11-14). Id interno não
 * tem por que circular, e aqui ninguém precisa ler o conteúdo além do
 * servidor. O AES-GCM também autentica, então não há assinatura separada:
 * mexer num byte faz o decifrar falhar.
 */
export const convidarAniversario = dados => guardarPapel('aniversario', dados);
export const conferirAniversario = papel => lerPapel('aniversario', papel, PRAZO_ANIVERSARIO_MS);

/** Papel que o servidor dá e recebe de volta, sem contar nada a quem o carrega. */
function guardarPapel(uso, dados) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave(`papel:${uso}`), iv);
  const claro = JSON.stringify({ ...dados, em: Date.now() });
  const cifrado = Buffer.concat([c.update(claro, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), cifrado]).toString('base64url');
}

function lerPapel(uso, papel, prazoMs) {
  try {
    const buf = Buffer.from(String(papel || ''), 'base64url');
    if (buf.length < 29) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', chave(`papel:${uso}`), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    const dados = JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8'));
    if (!dados?.em || Date.now() - dados.em > prazoMs) return null;
    return dados;
  } catch {
    // Mexido, de outro uso, ou de um segredo antigo: tudo isso é "não vale".
    return null;
  }
}

/** AES-256-GCM: iv(12) + tag(16) + cifrado, em base64. */
export function cifrar(texto) {
  if (texto == null) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave('tokens'), iv);
  const cifrado = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), cifrado]).toString('base64');
}

export function decifrar(guardado) {
  if (!guardado) return null;
  const buf = Buffer.from(guardado, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', chave('tokens'), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}
