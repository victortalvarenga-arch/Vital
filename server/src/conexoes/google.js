import { pedir } from './http.js';

/**
 * Avaliações do Google pela Business Profile API.
 *
 * Escolhida em vez da Places API (2026-10-10) porque devolve TODAS as
 * avaliações e a nota de verdade, e não as 5 que o Google escolhe; o preço é
 * a dona autorizar uma vez, e a Vital ter acesso aprovado à API — ver
 * ROADMAP.md, Bloco 6b.
 *
 * O escopo `business.manage` é o único que existe para ler avaliação, e ele
 * também edita a ficha. A gente só lê; o token é guardado cifrado
 * (`lib/segredo.js`) justamente porque poderia mais.
 */

const AUTORIZAR = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOGAR = 'https://oauth2.googleapis.com/revoke';
const CONTAS = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts';
const FICHAS = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const AVALIACOES = 'https://mybusiness.googleapis.com/v4';
const ESCOPO = 'https://www.googleapis.com/auth/business.manage';

const ESTRELAS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

const SEM_FICHA = 'Esta conta do Google não administra nenhuma ficha de empresa. Conecte com a conta dona da ficha.';

/** Quantas vão para o site. A nota e o total contam todas. */
const NO_SITE = 6;

const credenciais = () => ({
  id: process.env.GOOGLE_CLIENT_ID || '',
  segredo: process.env.GOOGLE_CLIENT_SECRET || '',
});

const expiraEm = segundos => new Date(Date.now() + (Number(segundos) || 3600) * 1000);

/**
 * "Maria Aparecida Souza" vira "Maria S.".
 *
 * A avaliação é pública no Google, mas o site da empresa é outro lugar: nome
 * completo de cliente ali é dado pessoal republicado sem precisar. O primeiro
 * nome e a inicial bastam para a avaliação parecer de gente.
 */
export function abreviarNome(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return 'Cliente do Google';
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes.at(-1)[0].toUpperCase()}.`;
}

/**
 * Avaliação traduzida pelo Google chega como "(Translated by Google) ...
 * (Original) ...". No site vale o que a pessoa escreveu.
 */
function textoOriginal(comentario) {
  const t = String(comentario || '');
  const i = t.indexOf('(Original)');
  return (i >= 0 ? t.slice(i + '(Original)'.length) : t).trim();
}

export const google = {
  nome: 'google',

  configurado: () => !!(credenciais().id && credenciais().segredo),

  urlDeAutorizacao({ estado, retorno }) {
    const q = new URLSearchParams({
      client_id: credenciais().id,
      redirect_uri: retorno,
      response_type: 'code',
      scope: ESCOPO,
      // `offline` + `consent` é o que garante o refresh_token. Sem `consent`,
      // quem já autorizou antes volta sem ele, e a conexão morre em uma hora.
      access_type: 'offline',
      prompt: 'consent',
      state: estado,
    });
    return `${AUTORIZAR}?${q}`;
  },

  async trocarCodigo({ codigo, retorno }) {
    const t = await pedir(TOKEN, {
      method: 'POST',
      form: {
        code: codigo, client_id: credenciais().id, client_secret: credenciais().segredo,
        redirect_uri: retorno, grant_type: 'authorization_code',
      },
    });
    const fichas = await listarFichas(t.access_token);
    const unica = fichas.length === 1 ? fichas[0] : null;
    return {
      tokenAcesso: t.access_token,
      tokenRenovacao: t.refresh_token || null,
      expiraEm: expiraEm(t.expires_in),
      conta: unica?.nome || '',
      extra: { fichas, ficha: unica?.id || null },
      // Mais de uma ficha (rede com várias lojas) e a dona escolhe no painel.
      // Nenhuma: a conta autorizada não administra ficha alguma.
      situacao: unica ? 'ok' : fichas.length ? 'escolher' : 'erro',
      erro: fichas.length ? '' : SEM_FICHA,
    };
  },

  /** O token de acesso dura uma hora; renova com folga de cinco minutos. */
  precisaRenovar: c => !c.expiraEm || c.expiraEm.getTime() - Date.now() < 5 * 60_000,

  async renovar(c) {
    if (!c.tokenRenovacao) {
      const e = new Error('A autorização do Google não tem renovação. Conecte de novo.');
      e.reconectar = true;
      throw e;
    }
    const t = await pedir(TOKEN, {
      method: 'POST',
      form: {
        refresh_token: c.tokenRenovacao, client_id: credenciais().id,
        client_secret: credenciais().segredo, grant_type: 'refresh_token',
      },
    });
    return { tokenAcesso: t.access_token, expiraEm: expiraEm(t.expires_in) };
  },

  /** Devolve o pedaço da config que o site lê. */
  async sincronizar(c) {
    if (!c.extra?.fichas?.length) throw new Error(SEM_FICHA);
    const ficha = c.extra.fichas.find(f => f.id === c.extra.ficha);
    if (!ficha) throw new Error('Escolha qual ficha do Google aparece no site.');

    const q = new URLSearchParams({ pageSize: '50', orderBy: 'updateTime desc' });
    const r = await pedir(`${AVALIACOES}/${ficha.id}/reviews?${q}`, { token: c.tokenAcesso });

    const lista = (r?.reviews || [])
      .map(a => ({
        autor: a.reviewer?.isAnonymous ? 'Cliente do Google' : abreviarNome(a.reviewer?.displayName),
        nota: ESTRELAS[a.starRating] || 0,
        texto: textoOriginal(a.comment).slice(0, 600),
        data: String(a.createTime || '').slice(0, 10),
      }))
      // Só as de 4 e 5 estrelas com texto vão para a lista — é a vitrine da
      // empresa. O que impede isso de virar propaganda enganosa é a nota e o
      // total ao lado, que contam todas as avaliações, e o link para o Google.
      .filter(a => a.nota >= 4 && a.texto)
      .slice(0, NO_SITE);

    return {
      avaliacoesGoogle: {
        nota: r?.averageRating ? Math.round(r.averageRating * 10) / 10 : null,
        total: Number(r?.totalReviewCount || 0),
        link: ficha.link || '',
        lista,
      },
    };
  },

  async revogar(c) {
    await pedir(`${REVOGAR}?token=${encodeURIComponent(c.tokenRenovacao || c.tokenAcesso)}`, { method: 'POST' });
  },

  /** O que some do site ao desconectar. */
  configAoDesconectar: () => ({ avaliacoesGoogle: { nota: null, total: 0, link: '', lista: [] } }),
};

/** Todas as fichas que a conta administra, de todas as contas de empresa dela. */
async function listarFichas(token) {
  const { accounts = [] } = await pedir(CONTAS, { token }) || {};
  const fichas = [];
  for (const conta of accounts) {
    const q = new URLSearchParams({ readMask: 'name,title,metadata', pageSize: '100' });
    const { locations = [] } = await pedir(`${FICHAS}/${conta.name}/locations?${q}`, { token }) || {};
    for (const l of locations) {
      fichas.push({
        // A API v4 de avaliações quer o caminho com a conta na frente.
        id: `${conta.name}/${l.name}`,
        nome: l.title || l.name,
        link: l.metadata?.mapsUri || '',
      });
    }
  }
  return fichas;
}
