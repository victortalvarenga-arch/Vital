/**
 * Cliente da API da Vital — a nossa, não a de nenhuma empresa.
 *
 * Arquivo separado de `shared/painel-api.js` pelo mesmo motivo que o site nunca
 * importa o painel: são identidades diferentes, e misturá-las num arquivo só é
 * o começo de misturá-las numa sessão só. O cookie daqui tem outro nome
 * (`sessao_vital`), e o servidor não aceita um no lugar do outro.
 */

const BASE = import.meta.env.VITE_API_URL || '/api';

async function req(caminho, { method = 'GET', body } = {}) {
  const r = await fetch(BASE + caminho, {
    method,
    headers: { 'Content-Type': 'application/json' },
    // O cookie é httpOnly: o JavaScript não o lê, só pede ao navegador que o
    // envie. É o que impede um XSS de levar a sessão embora.
    credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await r.text();
  const json = texto ? JSON.parse(texto) : null;
  if (!r.ok) throw new Error(json?.erro || `Falha na requisição (${r.status})`);
  return json;
}

export const api = {
  /* ── cadastro de empresa: aberto, é a porta de entrada do produto ── */
  enderecoLivre: nome => req(`/cadastro/endereco-livre?nome=${encodeURIComponent(nome)}`),
  cadastrar: dados => req('/cadastro', { method: 'POST', body: dados }),

  /* ── a nossa equipe ── */
  precisaConfigurar: () => req('/plataforma/precisa-configurar'),
  primeiroAcesso: dados => req('/plataforma/primeiro-acesso', { method: 'POST', body: dados }),
  login: (email, senha) => req('/plataforma/login', { method: 'POST', body: { email, senha } }),
  sair: () => req('/plataforma/sair', { method: 'POST' }),
  eu: () => req('/plataforma/eu'),

  /* ── as empresas-cliente ── */
  empresas: () => req('/plataforma/empresas'),
  resumo: () => req('/plataforma/resumo'),
  mudarStatus: (id, status, motivo) =>
    req(`/plataforma/empresas/${id}/status`, { method: 'POST', body: { status, motivo } }),
  mudarPlano: (id, plano) =>
    req(`/plataforma/empresas/${id}/plano`, { method: 'PATCH', body: { plano } }),
  auditoria: empresaId =>
    req('/plataforma/auditoria' + (empresaId ? `?empresaId=${empresaId}` : '')),
};
