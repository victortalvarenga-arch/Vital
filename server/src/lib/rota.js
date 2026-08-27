/**
 * Envolve um handler assíncrono para que erro dentro dele chegue ao
 * tratador de erros do Express.
 *
 * O Express 4 não sabe lidar com Promise rejeitada: sem isto, uma falha de
 * banco vira "unhandled rejection" no log e a requisição fica pendurada até o
 * navegador desistir — sem status, sem mensagem. Com o SQLite o problema não
 * aparecia porque nada era assíncrono.
 *
 * O Express 5 faz isso sozinho; quando atualizarmos, este arquivo sai.
 */
export const rota = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
