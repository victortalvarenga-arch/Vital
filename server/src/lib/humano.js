/**
 * "É gente, não robô" — o Cloudflare Turnstile, na porta do cadastro.
 *
 * O cadastro cria empresa, endereço e dono numa chamada aberta para a
 * internet. Sem freio, um script cria milhares de empresas falsas: lixo no
 * back-office, subdomínios ocupados e, quando houver cobrança, contas de
 * teste grátis sem fim. O Turnstile é gratuito e não pede para a pessoa
 * clicar em semáforo — na maior parte das vezes ela nem vê.
 *
 * Sem `TURNSTILE_SECRET`, não confere: é o desenvolvimento, e a suíte.
 * Com ela, o token é obrigatório e conferido na Cloudflare; se a Cloudflare
 * não responder, recusa — deixar passar quando a conferência falha é abrir a
 * porta justo quando alguém consegue derrubar a conferência.
 */

const VERIFICAR = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** A chave pública do widget, ou `null` quando a conferência está desligada. */
export const chaveDoSite = () =>
  (process.env.TURNSTILE_SECRET && process.env.TURNSTILE_SITE_KEY) || null;

/** `null` se pode seguir; senão, a mensagem para a pessoa. */
export async function conferirHumano(token, ip) {
  const segredo = process.env.TURNSTILE_SECRET;
  if (!segredo) return null;
  if (!token || String(token).length > 2048) return 'confirme que você não é um robô';
  try {
    const r = await fetch(VERIFICAR, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: segredo, response: String(token), ...(ip ? { remoteip: ip } : {}) }),
    });
    const corpo = await r.json();
    // Token vencido (5 min) ou já usado: a tela gera outro e a pessoa tenta de novo.
    return corpo.success ? null : 'a verificação venceu — confirme de novo que você não é um robô';
  } catch (erro) {
    console.error('[turnstile]', erro.message);
    return 'não consegui confirmar a verificação agora. Tente de novo em instantes.';
  }
}
