/**
 * Cliente da API pública — o que o site da cliente usa.
 *
 * Este arquivo NUNCA manda token. É a diferença que permite publicar o site na
 * internet: mesmo que alguém leia o bundle inteiro, não encontra credencial de
 * painel, porque ela não passa por aqui.
 */

const BASE = import.meta.env.VITE_API_URL || '/api';

async function req(caminho, { method = 'GET', body } = {}) {
  const r = await fetch(BASE + '/publico' + caminho, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await r.text();
  const json = texto ? JSON.parse(texto) : null;
  if (!r.ok) throw new Error(json?.erro || `Falha na requisição (${r.status})`);
  return json;
}

/** Identidade, marca, serviços e equipe: tudo que a home precisa. */
export const vitrine = () => req('/vitrine');

/**
 * Horários livres de verdade, vindos do servidor.
 * Sem `profissionalId`, devolve as opções de cada profissional do serviço.
 */
export function horarios({ servicoId, comboId, profissionalId, unidadeId, adicionais, data }) {
  // Combo ocupa a cadeira pelo pacote inteiro; quem responde a duração é o
  // servidor, a partir dos serviços que estão dentro dele.
  const q = new URLSearchParams(comboId ? { comboId, data } : { servicoId, data });
  if (profissionalId) q.set('profissionalId', profissionalId);
  // Extras mudam a duração, e duração muda o que cabe na agenda.
  if (unidadeId) q.set('unidadeId', unidadeId);
  if (!comboId && adicionais?.length) q.set('adicionais', adicionais.join(','));
  return req(`/horarios?${q}`);
}

/**
 * Quais dias de um mês têm vaga. O calendário pinta a partir disto, numa
 * chamada só — pedir dia a dia seriam trinta.
 */
export function diasLivres({ servicoId, comboId, profissionalId, unidadeId, adicionais, mes }) {
  const q = new URLSearchParams(comboId ? { comboId, mes } : { servicoId, mes });
  if (profissionalId) q.set('profissionalId', profissionalId);
  if (unidadeId) q.set('unidadeId', unidadeId);
  if (!comboId && adicionais?.length) q.set('adicionais', adicionais.join(','));
  return req(`/dias-livres?${q}`);
}

/** Diz se o WhatsApp já tem cadastro — para não pedir os dados de novo. */
export const identificar = fone => req('/identificar', { method: 'POST', body: { fone } });

export const agendar = dados => req('/agendar', { method: 'POST', body: dados });
