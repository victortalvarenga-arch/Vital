/**
 * Envio de e-mail, com provedor trocável — mesma ideia do WhatsApp.
 *
 * EMAIL_PROVIDER=console → não envia: imprime no terminal. Desenvolvimento.
 * EMAIL_PROVIDER=resend  → API do Resend (plano grátis: 3.000/mês). Precisa do
 *                          domínio verificado lá, senão só entrega para o
 *                          próprio dono da conta.
 *
 * **Em produção, o modo console não imprime o conteúdo.** E-mail de
 * redefinição carrega um link que troca a senha; log de servidor é lido por
 * mais gente e guardado por mais tempo do que uma caixa de entrada.
 *
 * Nunca lança: quem chama não pode responder diferente porque o envio falhou —
 * a resposta de "esqueci a senha" é a mesma exista o e-mail ou não.
 */
export async function enviarEmail({ para, assunto, texto }) {
  const provedor = process.env.EMAIL_PROVIDER || 'console';

  if (provedor === 'resend') {
    const { RESEND_API_KEY, EMAIL_REMETENTE } = process.env;
    if (!RESEND_API_KEY || !EMAIL_REMETENTE) {
      console.error('[email] faltam RESEND_API_KEY e EMAIL_REMETENTE');
      return { ok: false };
    }
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: EMAIL_REMETENTE, to: [para], subject: assunto, text: texto }),
      });
      if (!r.ok) console.error('[email] Resend recusou:', r.status, (await r.text()).slice(0, 200));
      return { ok: r.ok };
    } catch (erro) {
      console.error('[email] falhou:', erro.message);
      return { ok: false };
    }
  }

  if (process.env.NODE_ENV === 'production') {
    console.error(`[email] não enviado (EMAIL_PROVIDER não configurado): "${assunto}"`);
    return { ok: false };
  }
  console.log(`\n[email] para ${para} — ${assunto}\n${texto}\n`);
  return { ok: true, console: true };
}
