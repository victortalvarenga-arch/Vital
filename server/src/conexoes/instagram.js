import { pedir } from './http.js';
import { guardarImagem, TIPOS_DE_IMAGEM } from '../routes/uploads.js';

/**
 * Publicações do Instagram pela "Instagram API with Instagram Login".
 *
 * Exige conta Profissional (comercial ou criador). Enquanto o app da Vital não
 * passar pela App Review da Meta, só contas cadastradas como testadoras
 * conseguem autorizar — o roteiro completo está no ROADMAP.md, Bloco 6b.
 *
 * As URLs de imagem da Meta expiram em dias. Por isso a foto é BAIXADA e
 * guardada como qualquer upload da empresa, e a grade do site nunca aponta
 * para o CDN deles.
 */

const AUTORIZAR = 'https://www.instagram.com/oauth/authorize';
const TOKEN_CURTO = 'https://api.instagram.com/oauth/access_token';
const GRAPH = 'https://graph.instagram.com';

const DIA = 24 * 3600_000;
const MAX_BYTES = 8 * 1024 * 1024;
const NA_GRADE = 6;

const credenciais = () => ({
  id: process.env.INSTAGRAM_APP_ID || '',
  segredo: process.env.INSTAGRAM_APP_SECRET || '',
});

const expiraEm = segundos => new Date(Date.now() + (Number(segundos) || 60 * 86400) * 1000);

export const instagram = {
  nome: 'instagram',

  configurado: () => !!(credenciais().id && credenciais().segredo),

  urlDeAutorizacao({ estado, retorno }) {
    const q = new URLSearchParams({
      client_id: credenciais().id,
      redirect_uri: retorno,
      response_type: 'code',
      // Só ler perfil e publicações. Pedir mais atrasa a App Review.
      scope: 'instagram_business_basic',
      state: estado,
    });
    return `${AUTORIZAR}?${q}`;
  },

  async trocarCodigo({ codigo, retorno }) {
    // A Meta às vezes devolve o código com "#_" grudado no fim.
    const code = String(codigo).replace(/#_$/, '');
    const curto = await pedir(TOKEN_CURTO, {
      method: 'POST',
      form: {
        client_id: credenciais().id, client_secret: credenciais().segredo,
        grant_type: 'authorization_code', redirect_uri: retorno, code,
      },
    });
    // O curto vale uma hora; o longo, 60 dias, renováveis pelo job.
    const q = new URLSearchParams({
      grant_type: 'ig_exchange_token', client_secret: credenciais().segredo,
      access_token: curto.access_token,
    });
    const longo = await pedir(`${GRAPH}/access_token?${q}`);
    const eu = await pedir(`${GRAPH}/me?fields=user_id,username&access_token=${encodeURIComponent(longo.access_token)}`);
    return {
      tokenAcesso: longo.access_token,
      tokenRenovacao: null,
      expiraEm: expiraEm(longo.expires_in),
      conta: eu?.username ? `@${eu.username}` : '',
      extra: { usuario: eu?.username || '', idMeta: String(eu?.user_id || curto.user_id || '') },
      situacao: 'ok',
      erro: '',
    };
  },

  /**
   * Renova quando faltam menos de 30 dias. A Meta só aceita renovar token com
   * mais de 24h de vida e ainda válido — vencido, a dona conecta de novo.
   */
  precisaRenovar: c => !!c.expiraEm
    && c.expiraEm.getTime() - Date.now() < 30 * DIA
    && Date.now() - c.renovadoEm.getTime() > DIA,

  async renovar(c) {
    const q = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: c.tokenAcesso });
    const t = await pedir(`${GRAPH}/refresh_access_token?${q}`);
    return { tokenAcesso: t.access_token, expiraEm: expiraEm(t.expires_in) };
  },

  async sincronizar(c, { tenantId, config }) {
    const campos = 'id,media_type,media_url,thumbnail_url,permalink';
    const q = new URLSearchParams({ fields: campos, limit: String(NA_GRADE), access_token: c.tokenAcesso });
    const { data = [] } = await pedir(`${GRAPH}/me/media?${q}`) || {};

    // Publicação que já está na grade não é baixada de novo a cada hora.
    const jaTenho = new Map((config.instagramPosts || []).filter(p => p.id).map(p => [p.id, p.imagem]));

    const posts = [];
    for (const m of data.slice(0, NA_GRADE)) {
      const video = m.media_type === 'VIDEO';
      const origem = video ? m.thumbnail_url : m.media_url;
      let imagem = jaTenho.get(m.id);
      if (!imagem && origem) imagem = await baixar(origem, tenantId);
      if (!imagem) continue;
      posts.push({ id: m.id, imagem, link: m.permalink || '', tipo: video ? 'video' : 'imagem' });
    }

    const patch = { instagramPosts: posts };
    // O perfil do rodapé passa a ser o da conta conectada: é a fonte certa, e
    // um @ digitado errado deixaria o "Seguir" apontando para outra pessoa.
    if (c.extra?.usuario) patch.instagram = c.extra.usuario;
    return patch;
  },

  // A Meta não tem rota de revogar para este produto: quem tira o acesso é a
  // dona, no app (Configurações → Apps e sites). Apagar o token daqui basta
  // para a Vital parar de usar.
  async revogar() {},

  configAoDesconectar: () => ({ instagramPosts: [] }),
};

async function baixar(url, tenantId) {
  const r = await fetch(url);
  if (!r.ok) return null;
  const tipo = (r.headers.get('content-type') || '').split(';')[0].trim();
  if (!TIPOS_DE_IMAGEM[tipo]) return null;
  const bytes = Buffer.from(await r.arrayBuffer());
  if (bytes.length > MAX_BYTES) return null;
  return guardarImagem(tenantId, bytes, tipo, 'instagram');
}
