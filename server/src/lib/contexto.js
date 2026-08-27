import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Guarda, por requisição, qual conexão do Postgres usar.
 *
 * O RLS decide o que a consulta enxerga a partir de `app.tenant_id`, que é uma
 * configuração *da conexão*. Ou seja: toda consulta de uma requisição precisa
 * sair da mesma conexão, aquela onde a empresa foi definida.
 *
 * A alternativa seria passar a conexão como argumento em todas as consultas do
 * projeto — e bastaria esquecer uma para ela sair pelo pool sem empresa
 * definida e não devolver nada. Com AsyncLocalStorage, `db.get/all/run`
 * descobrem sozinhos a conexão certa, e código de rota nem sabe que isso
 * existe.
 */
export const contexto = new AsyncLocalStorage();

/** A conexão da requisição atual, se houver. */
export const conexaoAtual = () => contexto.getStore()?.cliente;

/** A empresa da requisição atual, se houver. */
export const empresaAtual = () => contexto.getStore()?.tenantId;
