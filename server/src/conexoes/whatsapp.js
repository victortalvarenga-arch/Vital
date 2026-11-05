import { pedir } from './http.js';

/**
 * O número de WhatsApp da empresa na Cloud API da Meta.
 *
 * Fala o mesmo formato do Google e do Instagram para caber em `conexoes`, com
 * uma diferença: **não há tela de autorização.** O caminho definitivo é o
 * cadastro incorporado da Meta, que depende da Vital verificada lá (ROADMAP,
 * Bloco 12). Até lá, a dona cola o id do número e o token no painel. Sem
 * `urlDeAutorizacao`, a rota `/iniciar` recusa este provedor.
 *
 * O cadastro incorporado vai terminar chamando `gravarConexao` com o mesmo
 * formato de `conectar`, e nada depois disso muda.
 */

export const urlDaApi = caminho =>
  `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || 'v21.0'}/${caminho}`;

const consultarNumero = (phoneId, token) =>
  pedir(urlDaApi(`${phoneId}?fields=display_phone_number,verified_name`), { token });

export const whatsapp = {
  nome: 'whatsapp',

  // Não depende de credencial da Vital: quem traz a conta é a empresa.
  configurado: () => true,

  /** Confere com a Meta antes de gravar: token errado precisa falhar aqui, e não no lembrete de amanhã. */
  async conectar({ phoneId, token }) {
    const n = await consultarNumero(phoneId, token);
    return {
      tokenAcesso: token,
      tokenRenovacao: null,
      expiraEm: null,
      conta: [n?.verified_name, n?.display_phone_number].filter(Boolean).join(' · '),
      extra: { phoneId },
      situacao: 'ok',
      erro: '',
    };
  },

  precisaRenovar: () => false,

  // O job de hora em hora só confere se o número continua respondendo. Token
  // revogado vira `situacao = 'erro'`, e a empresa volta ao modo manual com o
  // aviso no painel, em vez de cada lembrete falhar calado.
  async sincronizar(c) {
    await consultarNumero(c.extra.phoneId, c.tokenAcesso);
    return {};
  },

  // Quem revoga o token é a dona, na Meta. Apagar daqui basta para a Vital parar.
  async revogar() {},

  configAoDesconectar: () => ({}),
};
