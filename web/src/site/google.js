/**
 * O botão "entrar com Google" no site da cliente.
 *
 * **Só existe quando a Vital tem o login configurado.** O id do cliente OAuth
 * vem da vitrine, ao lado de `negocio` e não dentro dele (`dados.googleClientId`,
 * porque é da plataforma e não de cada empresa); vazio, nada aqui roda e o
 * agendamento segue como sempre, só com o WhatsApp. Esta é a regra que mantém
 * o login como **opção**: ele pode não estar ligado, e nada quebra.
 *
 * **O script é de terceiro, e isso tem preço.** `accounts.google.com` só é
 * carregado quando a empresa tem o login ligado e a cliente chega ao passo de
 * dados — não na home, não em toda visita. Antes disso, o site não fala com o
 * Google (a política de privacidade diz isso em "O que fica no seu aparelho").
 *
 * O que sai daqui é só o `credential`: o ID token que o Google assina. Quem
 * decide o que ele vale é o servidor (`lib/google-login.js`) — a tela não
 * confere nada, e nem poderia.
 */

const SCRIPT = 'https://accounts.google.com/gsi/client';

let carregando = null;

/** Carrega o script uma vez por página, e nunca duas em paralelo. */
function carregarScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (carregando) return carregando;

  carregando = new Promise((ok, falha) => {
    const tag = document.createElement('script');
    tag.src = SCRIPT;
    tag.async = true;
    tag.onload = () => ok();
    // Rede ruim, bloqueador de script, rede corporativa que barra o Google:
    // falhar aqui não pode travar o agendamento. Quem chama esconde o botão.
    tag.onerror = () => { carregando = null; falha(new Error('não consegui carregar o Google')); };
    document.head.appendChild(tag);
  });
  return carregando;
}

/**
 * Desenha o botão do Google dentro de `alvo` e chama `aoEntrar(credential)`.
 *
 * Devolve `false` quando não dá para oferecer o login — sem id configurado, ou
 * o script não carregou. A tela usa isso para simplesmente não mostrar nada:
 * botão que não funciona é pior que botão ausente.
 */
export async function botaoDoGoogle({ alvo, clientId, aoEntrar }) {
  if (!clientId || !alvo) return false;
  try {
    await carregarScript();
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: resposta => aoEntrar(resposta?.credential || ''),
      // Sem o "entrar automaticamente": a cliente escolhe. Login que acontece
      // sozinho ao abrir a página é o oposto de opção.
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    window.google.accounts.id.renderButton(alvo, {
      type: 'standard', theme: 'outline', size: 'large',
      text: 'continue_with', shape: 'pill', locale: 'pt-BR',
      width: alvo.offsetWidth || undefined,
    });
    return true;
  } catch {
    return false;
  }
}

/** Esquece quem entrou, para o próximo toque voltar a perguntar a conta. */
export function esquecerGoogle() {
  try { window.google?.accounts?.id?.disableAutoSelect(); } catch { /* sem script, nada a fazer */ }
}
