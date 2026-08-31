/**
 * Adaptador para o storage de objeto (Cloudflare R2, compatível com a API do
 * S3) — o que o ROADMAP já previa: "server/uploads/<empresa>/ só funciona com
 * disco que persiste [...] é um adaptador: só routes/uploads.js muda".
 *
 * Ativo só quando as quatro variáveis abaixo existem no ambiente. Sem elas,
 * `uploads.js` continua gravando em disco, como sempre — é o que deixa
 * `npm run dev` funcionar numa máquina sem nenhuma credencial de nuvem.
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;

export const R2_ATIVO = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);

// R2 fala o protocolo do S3 num endpoint próprio, por conta — não existe
// "região" de verdade, mas o SDK exige o campo, e 'auto' é o valor que a
// Cloudflare documenta para isso.
const cliente = R2_ATIVO
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    })
  : null;

/**
 * Grava `bytes` no bucket, na chave dada — sempre `<tenantId>/<arquivo>`, a
 * mesma estrutura de pasta que o disco já usava, para o bucket poder
 * substituir `server/uploads/` sem mudar nada além de onde o arquivo mora.
 */
export async function subirParaR2(chave, bytes, tipoMime) {
  await cliente.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: chave,
    Body: bytes,
    ContentType: tipoMime,
    // 7 dias, igual ao Cache-Control que express.static já usa para a mesma
    // pasta em disco (ver app.js) — o nome do arquivo já é único (hex
    // aleatório), então cachear forte não arrisca servir versão velha.
    CacheControl: 'public, max-age=604800',
  }));
}
