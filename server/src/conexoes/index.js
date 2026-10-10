import { db, getConfig, setConfig } from '../db.js';
import { empresaAtual } from '../lib/contexto.js';
import { cifrar, decifrar, segredoConfigurado } from '../lib/segredo.js';
import { google } from './google.js';
import { instagram } from './instagram.js';

/**
 * Contas externas que a empresa conecta: Google (avaliações) e Instagram
 * (publicações). Um formato só para as duas:
 *
 *   painel → "Conectar" → tela do provedor → retorno com código → token
 *   guardado em `conexoes` (cifrado) → sincronizar escreve na config → o site
 *   que já existe mostra.
 *
 * O site nunca fala com Google nem Meta: lê a config, como sempre. É isso que
 * deixa a vitrine rápida e o limite de chamadas dos provedores longe — uma
 * busca por hora por empresa, não uma por visita.
 */
export const PROVEDORES = { google, instagram };

export function provedor(nome) {
  return Object.hasOwn(PROVEDORES, nome) ? PROVEDORES[nome] : null;
}

/**
 * O endereço para onde Google e Meta devolvem a pessoa. Um só para todas as
 * empresas — é o que fica cadastrado no console de cada provedor — e por isso
 * a empresa viaja assinada no `state` (ver `lib/segredo.js`).
 */
export function urlDeRetorno(nome) {
  const base = (process.env.CONEXOES_RETORNO_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${base}/api/oauth/${nome}/retorno`;
}

const linhaParaConexao = r => r && ({
  provedor: r.provedor,
  tokenAcesso: decifrar(r.token_acesso),
  tokenRenovacao: decifrar(r.token_renovacao),
  expiraEm: r.expira_em ? new Date(r.expira_em) : null,
  renovadoEm: new Date(r.renovado_em),
  conta: r.conta,
  extra: r.extra || {},
  situacao: r.situacao,
  erro: r.ultimo_erro,
  sincronizadoEm: r.sincronizado_em,
});

export async function lerConexao(nome) {
  return linhaParaConexao(await db.get('SELECT * FROM conexoes WHERE provedor = ?', nome));
}

/** Grava a conexão nova por cima da antiga: conectar de novo é recomeçar. */
export async function gravarConexao(nome, d, { usuarioId = '' } = {}) {
  await db.run(
    `INSERT INTO conexoes (provedor, token_acesso, token_renovacao, expira_em, renovado_em,
                           conta, extra, situacao, ultimo_erro, sincronizado_em,
                           conectado_em, conectado_por)
     VALUES (?,?,?,?, now(), ?,?,?,?, NULL, now(), ?)
     ON CONFLICT (tenant_id, provedor) DO UPDATE SET
       token_acesso = EXCLUDED.token_acesso, token_renovacao = EXCLUDED.token_renovacao,
       expira_em = EXCLUDED.expira_em, renovado_em = now(), conta = EXCLUDED.conta,
       extra = EXCLUDED.extra, situacao = EXCLUDED.situacao,
       ultimo_erro = EXCLUDED.ultimo_erro, sincronizado_em = NULL,
       conectado_em = now(), conectado_por = EXCLUDED.conectado_por`,
    nome, cifrar(d.tokenAcesso), cifrar(d.tokenRenovacao), d.expiraEm || null,
    d.conta || '', JSON.stringify(d.extra || {}), d.situacao || 'ok', d.erro || '', usuarioId
  );
}

async function marcarErro(nome, erro) {
  await db.run(
    `UPDATE conexoes SET situacao = 'erro', ultimo_erro = ? WHERE provedor = ?`,
    String(erro?.message || erro).slice(0, 300), nome
  );
}

/** Token válido para usar agora, renovando antes se estiver perto de vencer. */
async function tokenEmDia(p, c) {
  if (!p.precisaRenovar(c)) return c;
  const novo = await p.renovar(c);
  await db.run(
    `UPDATE conexoes SET token_acesso = ?, expira_em = ?, renovado_em = now() WHERE provedor = ?`,
    cifrar(novo.tokenAcesso), novo.expiraEm, p.nome
  );
  return { ...c, ...novo, renovadoEm: new Date() };
}

/**
 * Busca no provedor e escreve na config. Nunca lança: a falha fica gravada na
 * conexão, para o painel mostrar "reconecte" em vez de o job morrer calado.
 */
export async function sincronizar(nome) {
  const p = provedor(nome);
  let c = await lerConexao(nome);
  if (!p || !c) return { ok: false, erro: 'não conectado' };
  if (c.situacao === 'escolher') return { ok: false, erro: 'escolha a ficha primeiro' };

  try {
    c = await tokenEmDia(p, c);
    const patch = await p.sincronizar(c, { tenantId: empresaAtual(), config: await getConfig() });
    await setConfig(patch);
    await db.run(
      `UPDATE conexoes SET situacao = 'ok', ultimo_erro = '', sincronizado_em = now() WHERE provedor = ?`,
      nome
    );
    return { ok: true };
  } catch (erro) {
    console.error(`[conexoes] ${nome} na empresa ${empresaAtual()}:`, erro.message);
    await marcarErro(nome, erro.reconectar
      ? 'A autorização caiu (senha trocada ou acesso removido). Conecte de novo.'
      : erro);
    return { ok: false, erro: erro.message };
  }
}

/** Todas as conexões da empresa atual. É o que o job roda de hora em hora. */
export async function sincronizarTodas() {
  const linhas = await db.all(`SELECT provedor FROM conexoes WHERE situacao <> 'escolher' ORDER BY provedor`);
  for (const { provedor: nome } of linhas) await sincronizar(nome);
}

export async function desconectar(nome) {
  const p = provedor(nome);
  const c = await lerConexao(nome);
  if (!p || !c) return false;
  // Revogar é cortesia com a conta da dona; se o provedor recusar (token já
  // morto), apagar daqui continua sendo o que importa.
  try { await p.revogar(c); } catch (e) { console.warn(`[conexoes] revogar ${nome}:`, e.message); }
  await db.run('DELETE FROM conexoes WHERE provedor = ?', nome);
  await setConfig(p.configAoDesconectar());
  return true;
}

/**
 * O que o painel precisa saber de cada conexão — e nada de token.
 *
 * `disponivel` diz se a Vital já tem as credenciais do provedor no servidor:
 * sem elas o botão não tem para onde mandar, e a tela explica em vez de
 * oferecer um clique que dá erro.
 */
export async function situacoes() {
  const linhas = await db.all('SELECT * FROM conexoes');
  return Object.values(PROVEDORES).map(p => {
    const r = linhas.find(l => l.provedor === p.nome);
    return {
      provedor: p.nome,
      disponivel: p.configurado() && segredoConfigurado(),
      conectado: !!r,
      conta: r?.conta || '',
      situacao: r?.situacao || null,
      erro: r?.ultimo_erro || '',
      sincronizadoEm: r?.sincronizado_em || null,
      // Só o Google tem escolha de ficha; id e nome não são segredo.
      fichas: (r?.extra?.fichas || []).map(f => ({ id: f.id, nome: f.nome })),
      ficha: r?.extra?.ficha || null,
    };
  });
}

/** A dona escolheu qual ficha do Google vai para o site. */
export async function escolherFicha(fichaId) {
  const c = await lerConexao('google');
  const ficha = c?.extra?.fichas?.find(f => f.id === fichaId);
  if (!ficha) return false;
  await db.run(
    `UPDATE conexoes SET extra = ?, conta = ?, situacao = 'ok', ultimo_erro = '' WHERE provedor = 'google'`,
    JSON.stringify({ ...c.extra, ficha: ficha.id }), ficha.nome
  );
  return true;
}
