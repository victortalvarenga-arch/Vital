/**
 * Chamada a API de fora, com o erro do provedor virando mensagem legível.
 *
 * Google e Meta respondem erro em formatos diferentes (`error.message`,
 * `error_description`, `error_message`); a dona vê um texto só no painel, e
 * quem depura vê o status junto.
 */
export async function pedir(url, { method = 'GET', form, token, json } = {}) {
  const headers = {};
  let body;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form).toString();
  } else if (json) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }

  const r = await fetch(url, { method, headers, body });
  const texto = await r.text();
  let dados = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { dados = null; }

  if (!r.ok) {
    const e = dados?.error;
    const msg = (typeof e === 'object' ? e?.message : null)
      || dados?.error_description || dados?.error_message
      || (typeof e === 'string' ? e : null)
      || `HTTP ${r.status}`;
    const erro = new Error(msg);
    erro.status = r.status;
    // `invalid_grant` (Google) e o código 190 (Meta) dizem a mesma coisa: a
    // autorização acabou — senha trocada, acesso revogado, conta mudou de tipo.
    // Não adianta tentar de novo; a dona precisa conectar outra vez.
    erro.reconectar = e === 'invalid_grant' || e?.code === 190 || dados?.code === 190;
    throw erro;
  }
  return dados;
}
