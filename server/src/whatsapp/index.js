import { waLink, foneE164 } from '../lib/dates.js';

/**
 * Camada de envio de WhatsApp.
 *
 * A regra: o resto do sistema NUNCA fala com a Meta direto. Ele só chama
 * `enviar()`. Assim dá pra rodar tudo local sem conta aprovada, e trocar
 * o provider por variável de ambiente quando a conta sair.
 *
 * WHATSAPP_PROVIDER=manual  → não envia nada; devolve um link wa.me para o
 *                             atendente clicar. É o modo de desenvolvimento.
 * WHATSAPP_PROVIDER=meta    → API oficial do WhatsApp Business (Cloud API).
 */

const provedores = {
  /** Modo manual: a fila vira uma lista de links para o atendente disparar. */
  manual: {
    nome: 'manual',
    async enviar({ fone, texto }) {
      return { ok: true, manual: true, link: waLink(fone, texto), id: '' };
    },
  },

  /**
   * Cloud API da Meta.
   *
   * Atenção ao modelo de cobrança e às regras, porque elas ditam o produto:
   * - Se a cliente mandou mensagem nas últimas 24h, você pode responder com
   *   texto livre. Fora dessa janela, SÓ template previamente aprovado.
   * - Templates têm categoria: utilidade (lembrete, confirmação) é barato;
   *   marketing (aniversário, promoção, Natal) custa mais e pode ser bloqueado
   *   pela cliente sem afetar os de utilidade.
   * - Por isso `metaTemplateName` existe na tabela de templates: o texto que
   *   você edita no painel é a prévia; o que sai de fato é o template aprovado
   *   com as variáveis na ordem certa.
   */
  meta: {
    nome: 'meta',
    async enviar({ fone, texto, templateName, variaveisOrdenadas, idioma = 'pt_BR' }) {
      const { WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_API_VERSION = 'v21.0' } = process.env;
      if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
        return { ok: false, erro: 'Faltam WHATSAPP_TOKEN e WHATSAPP_PHONE_ID no .env' };
      }

      const corpo = templateName
        ? {
            messaging_product: 'whatsapp',
            to: foneE164(fone),
            type: 'template',
            template: {
              name: templateName,
              language: { code: idioma },
              components: variaveisOrdenadas?.length
                ? [{ type: 'body', parameters: variaveisOrdenadas.map(t => ({ type: 'text', text: String(t) })) }]
                : [],
            },
          }
        : {
            messaging_product: 'whatsapp',
            to: foneE164(fone),
            type: 'text',
            text: { preview_url: false, body: texto },
          };

      try {
        const r = await fetch(
          `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_ID}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${WHATSAPP_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(corpo),
          }
        );
        const json = await r.json();
        if (!r.ok) return { ok: false, erro: json?.error?.message || `HTTP ${r.status}` };
        return { ok: true, id: json?.messages?.[0]?.id || '' };
      } catch (e) {
        return { ok: false, erro: e.message };
      }
    },
  },
};

export function provider() {
  const nome = process.env.WHATSAPP_PROVIDER || 'manual';
  const p = provedores[nome];
  if (!p) throw new Error(`WHATSAPP_PROVIDER desconhecido: ${nome}`);
  return p;
}

export const enviar = (args) => provider().enviar(args);
export const modoManual = () => provider().nome === 'manual';
