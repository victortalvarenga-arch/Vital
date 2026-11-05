import { foneE164 } from '../lib/dates.js';
import { db } from '../db.js';
import { pedir } from '../conexoes/http.js';
import { lerConexao, marcarErro } from '../conexoes/index.js';
import { urlDaApi } from '../conexoes/whatsapp.js';

/**
 * Camada de envio de WhatsApp.
 *
 * A regra: o resto do sistema NUNCA fala com a Meta direto. Ele só chama
 * `enviar()`.
 *
 * **O modo é de cada empresa, e não do servidor.** Com o número conectado em
 * `conexoes`, as mensagens saem sozinhas pela API. Sem ele, ou com a conexão em
 * erro, a empresa fica no modo manual: a fila vira uma lista de links `wa.me`
 * para a equipe tocar. Roda sempre no contexto da empresa, e é o RLS que
 * garante que uma nunca use o número da outra.
 */

/** Sem conexão de pé, quem envia é a pessoa. */
export async function modoManual() {
  return !(await db.get(`SELECT 1 FROM conexoes WHERE provedor = 'whatsapp' AND situacao = 'ok'`));
}

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
export async function enviar({ fone, texto, templateName, variaveisOrdenadas, idioma = 'pt_BR' }) {
  const c = await lerConexao('whatsapp');
  if (c?.situacao !== 'ok') return { ok: false, erro: 'o WhatsApp da empresa não está conectado' };

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
    const r = await pedir(urlDaApi(`${c.extra.phoneId}/messages`),
      { method: 'POST', token: c.tokenAcesso, json: corpo });
    return { ok: true, id: r?.messages?.[0]?.id || '' };
  } catch (e) {
    // Token morto não melhora tentando de novo: a empresa volta ao modo manual
    // agora, em vez de esperar o job de hora em hora notar.
    if (e.reconectar) await marcarErro('whatsapp', 'A autorização caiu. Conecte o número de novo.');
    return { ok: false, erro: e.message };
  }
}
