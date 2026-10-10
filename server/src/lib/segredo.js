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

/** `state` = dados em base64url + ponto + HMAC. Vence em 15 minutos. */
export function assinarEstado(dados) {
  const corpo = b64(JSON.stringify({ ...dados, em: Date.now() }));
  const assinatura = b64(crypto.createHmac('sha256', chave('estado')).update(corpo).digest());
  return `${corpo}.${assinatura}`;
}

/** Os dados do `state`, ou `null` se foi mexido ou venceu. */
export function conferirEstado(estado) {
  const [corpo, assinatura] = String(estado || '').split('.');
  if (!corpo || !assinatura) return null;
  const esperada = crypto.createHmac('sha256', chave('estado')).update(corpo).digest();
  const recebida = Buffer.from(assinatura, 'base64url');
  // timingSafeEqual exige o mesmo tamanho, e lança se não for.
  if (recebida.length !== esperada.length || !crypto.timingSafeEqual(recebida, esperada)) return null;
  let dados;
  try { dados = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')); } catch { return null; }
  if (!dados?.em || Date.now() - dados.em > PRAZO_ESTADO_MS) return null;
  return dados;
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
