/**
 * Onde o banco mora, e se pode ser apagado.
 *
 * Reset, seed com conta de senha conhecida e `senha-app` só rodam em banco
 * descartável: localhost, ou um banco remoto que o `.env` declara descartável
 * (`VITAL_BANCO_DESCARTAVEL=sim`, o branch `dev` da Neon). Produção nunca tem
 * essa variável — sem ela, um banco remoto continua recusando.
 */
export const ehLocal = url => /localhost|127\.0\.0\.1/.test(url || '');

export const bancoDescartavel = () =>
  ehLocal(process.env.DATABASE_URL) || process.env.VITAL_BANCO_DESCARTAVEL === 'sim';

/**
 * Postgres gerenciado (Neon) exige TLS; o local não tem certificado.
 *
 * O certificado do servidor é CONFERIDO. Já foi `rejectUnauthorized: false`,
 * que aceita qualquer certificado — inclusive o de quem estiver no meio do
 * caminho lendo a senha e os dados. Só não valia porque o `sslmode` da URL
 * passa por cima desta opção no `pg`; uma URL sem `sslmode` desligaria a
 * conferência em silêncio. A Neon usa certificado de autoridade pública, que o
 * Node já reconhece sem nada a configurar. Nas URLs, use
 * `sslmode=verify-full`: `require` vai mudar de sentido na próxima versão do
 * `pg` e passar a não conferir.
 */
export const sslPara = url => (ehLocal(url) ? false : { rejectUnauthorized: true });
