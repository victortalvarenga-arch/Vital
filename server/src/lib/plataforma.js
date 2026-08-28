import crypto from 'node:crypto';
import { db, uid } from '../db.js';
import { hashDaSenha, senhaConfere } from './auth.js';

/**
 * Autenticação da nossa equipe — a da Vital, não a de uma empresa-cliente.
 *
 * Vive à parte de `lib/auth.js` de propósito, e não por organização de arquivo.
 * São dois espaços de identidade que nunca podem se cruzar: quem dá suporte não
 * é dono de nenhuma empresa, e o dono de uma empresa não administra a
 * plataforma. Tabela separada, cookie de nome diferente, nenhuma referência
 * cruzada — e as duas sessões podem coexistir no mesmo navegador sem se
 * enxergar, que é o caso normal enquanto se desenvolve.
 *
 * O resto (argon2, hash do token em vez do token) é igual ao do painel, e vem
 * de lá para não haver duas implementações da mesma coisa.
 */

const DIAS = 7;                    // menos que o painel: é acesso privilegiado
const COOKIE = 'sessao_vital';

const hashDoToken = token => crypto.createHash('sha256').update(token).digest('hex');

export const NOME_COOKIE_VITAL = COOKIE;

export const opcoesDoCookieVital = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: DIAS * 864e5,
  path: '/',
});

/** Poderes da nossa equipe. Suporte lê e abre chamado; admin mexe no contrato. */
export const PODERES_VITAL = {
  admin:   { verEmpresas: true, suspender: true, equipe: true },
  suporte: { verEmpresas: true, suspender: false, equipe: false },
};

export const podeNaPlataforma = (papel, poder) => Boolean(PODERES_VITAL[papel]?.[poder]);

export async function abrirSessaoVital({ usuarioId, agente }) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.run(
    `INSERT INTO plataforma.sessoes (token_hash, usuario_id, expira_em, agente)
     VALUES (?,?,?,?)`,
    hashDoToken(token), usuarioId, new Date(Date.now() + DIAS * 864e5),
    String(agente || '').slice(0, 200)
  );
  return token;
}

export async function fecharSessaoVital(token) {
  if (!token) return;
  await db.run('DELETE FROM plataforma.sessoes WHERE token_hash = ?', hashDoToken(token));
}

/** Quem é o dono deste cookie, ou `null`. */
export async function sessaoVitalDe(token) {
  if (!token) return null;
  const s = await db.get(
    `SELECT u.id, u.nome, u.email, u.papel, u.ativo
       FROM plataforma.sessoes s JOIN plataforma.usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = ? AND s.expira_em > now()`,
    hashDoToken(token)
  );
  if (!s || !s.ativo) return null;
  return { id: s.id, nome: s.nome, email: s.email, papel: s.papel };
}

/**
 * Login da nossa equipe.
 *
 * Mesma resposta para e-mail desconhecido e senha errada, e um hash de mentira
 * conferido quando o e-mail não existe — sem isso, o tempo de resposta diria
 * quais e-mails são da nossa equipe.
 */
const HASH_FALSO = '$argon2id$v=19$m=65536,t=3,p=4$c2VtLXVzdWFyaW8tYXF1aQ$0000000000000000000000000000000000000000000';

export async function entrarNaPlataforma({ email, senha, agente }) {
  const u = await db.get(
    'SELECT * FROM plataforma.usuarios WHERE email = ? AND ativo = 1',
    String(email || '').toLowerCase().trim()
  );
  const confere = u
    ? await senhaConfere(u.senha_hash, senha)
    : await senhaConfere(HASH_FALSO, senha);

  if (!u || !confere) return { erro: 'e-mail ou senha inválidos' };

  await db.run('UPDATE plataforma.usuarios SET ultimo_login = now()::date::text WHERE id = ?', u.id);
  const token = await abrirSessaoVital({ usuarioId: u.id, agente });
  return { token, usuario: { id: u.id, nome: u.nome, email: u.email, papel: u.papel } };
}

/** Cria a primeira pessoa da nossa equipe. Fecha sozinho depois da primeira. */
export async function criarPrimeiroAdmin({ nome, email, senha }) {
  const { n } = await db.get('SELECT COUNT(*) n FROM plataforma.usuarios');
  if (n > 0) return { erro: 'a plataforma já tem equipe cadastrada' };
  const id = uid();
  await db.run(
    `INSERT INTO plataforma.usuarios (id, nome, email, senha_hash, papel, ativo, criado_em)
     VALUES (?,?,?,?,'admin',1,now()::date::text)`,
    id, nome, String(email).toLowerCase().trim(), await hashDaSenha(senha)
  );
  return { id };
}

/**
 * Registra o que a nossa equipe fez.
 *
 * Abrir o dado de uma empresa para dar suporte é legítimo; fazer isso sem
 * deixar rastro, não. Toda ação que muda o estado de uma empresa passa por
 * aqui, e o registro é gravado ANTES da resposta sair — ação sem log é ação
 * que não aconteceu.
 */
export async function registrar({ usuarioId, tenantId = null, acao, detalhe = {} }) {
  await db.run(
    `INSERT INTO plataforma.auditoria (usuario_id, tenant_id, acao, detalhe)
     VALUES (?,?,?,?)`,
    usuarioId, tenantId, acao, JSON.stringify(detalhe)
  );
}
