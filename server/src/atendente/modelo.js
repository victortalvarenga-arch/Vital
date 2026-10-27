import Anthropic from '@anthropic-ai/sdk';

/**
 * A única porta para a IA. O resto do atendente nunca fala com a Anthropic
 * direto — mesma regra de `whatsapp/index.js`: assim o teste troca o modelo por
 * um roteiro (`definirModeloDeTeste`) e roda sem rede e sem gastar nada.
 *
 * Modelo e esforço vêm do ambiente, e a escolha certa é medida, não chutada:
 * a lista de avaliação dos guardrails diz qual o mais barato que acerta tudo
 * (ver ROADMAP, Bloco 12). O padrão é o mais capaz, em esforço baixo — conversa
 * de agendamento é curta e rende bem com pouco raciocínio.
 */

const MODELO = () => process.env.ATENDENTE_MODELO || 'claude-opus-5-5';
const ESFORCO = () => process.env.ATENDENTE_ESFORCO || 'low';

// Os modelos que aceitam o desvio automático quando o classificador de
// segurança recusa um pedido. Sem ele, uma recusa vira resposta vazia.
const COM_DESVIO = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']);

let deTeste = null;
let cliente = null;

/** Só para teste: troca o modelo por um objeto com `responder` e `julgar`. */
export function definirModeloDeTeste(falso) { deTeste = falso; }

export const chaveConfigurada = () => Boolean(deTeste || process.env.ANTHROPIC_API_KEY);
export const nomeDoModelo = () => (deTeste ? 'teste' : MODELO());

function anthropic() {
  cliente ??= new Anthropic();
  return cliente;
}

function pedidoBase(extra) {
  const modelo = MODELO();
  const desvio = COM_DESVIO.has(modelo)
    ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }
    : {};
  return { model: modelo, output_config: { effort: ESFORCO() }, ...desvio, ...extra };
}

/**
 * Uma volta da conversa: o modelo responde com texto ou pede ferramentas.
 * @returns {Promise<{ content: object[], stop_reason: string, usage?: object }>}
 */
export async function responder({ sistema, mensagens, ferramentas }) {
  if (deTeste) return deTeste.responder({ sistema, mensagens, ferramentas });
  const r = await anthropic().beta.messages.create(pedidoBase({
    max_tokens: 4000,
    system: sistema,
    tools: ferramentas,
    messages: mensagens,
  }));
  return { content: r.content, stop_reason: r.stop_reason, usage: r.usage };
}

/**
 * O juiz: devolve `{ aprovado, problemas }` ou `null` se não deu para julgar.
 * Não julgar não trava a conversa — as regras fixas já rodaram.
 */
export async function julgar({ sistema, pedido, esquema }) {
  if (deTeste) return deTeste.julgar ? deTeste.julgar({ sistema, pedido }) : { aprovado: true, problemas: [] };
  const base = pedidoBase({
    max_tokens: 2000,
    system: sistema,
    messages: [{ role: 'user', content: pedido }],
  });
  const r = await anthropic().beta.messages.create({
    ...base,
    output_config: { ...base.output_config, format: { type: 'json_schema', schema: esquema } },
  });
  if (r.stop_reason !== 'end_turn') return null;
  const texto = r.content.filter(b => b.type === 'text').map(b => b.text).join('');
  try { return JSON.parse(texto); } catch { return null; }
}
