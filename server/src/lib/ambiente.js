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

/** Postgres gerenciado (Neon) exige TLS; o local não tem certificado. */
export const sslPara = url => (ehLocal(url) ? false : { rejectUnauthorized: false });
