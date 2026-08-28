import crypto from 'node:crypto';
import argon2 from 'argon2';
import { db, uid } from '../db.js';

/**
 * Login do painel: senha com argon2, sessão em cookie httpOnly.
 *
 * Três decisões que valem entender antes de mexer aqui.
 *
 * **A senha nunca é guardada.** `senha_hash` guarda um hash argon2id, que é
 * lento de propósito: quem levar o banco embora não consegue testar bilhões de
 * senhas por segundo.
 *
 * **O cookie é httpOnly.** JavaScript da página não lê, então um XSS não
 * consegue roubar a sessão. É por isso que o token não vai para `localStorage`.
 *
 * **A tabela guarda o hash do token, não o token.** Mesmo motivo da senha: o
 * que está no banco não serve para entrar.
 */

const DIAS = 30;
const COOKIE = 'sessao';

/** argon2id com custo de memória — o padrão da lib já é uma escolha sensata. */
export const hashDaSenha = senha => argon2.hash(senha, { type: argon2.argon2id });

export const senhaConfere = (hash, senha) =>
  argon2.verify(hash, senha).catch(() => false);   // hash corrompido não derruba o login

const hashDoToken = token => crypto.createHash('sha256').update(token).digest('hex');

/** Cria a sessão e devolve o token que vai no cookie. */
export async function abrirSessao({ userId, tenantId, agente }) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expira = new Date(Date.now() + DIAS * 864e5);
  await db.run(
    `INSERT INTO sessoes (token_hash, tenant_id, user_id, expira_em, agente)
     VALUES (?,?,?,?,?)`,
    hashDoToken(token), tenantId, userId, expira, String(agente || '').slice(0, 200)
  );
  return { token, expira };
}

export async function fecharSessao(token) {
  if (!token) return;
  await db.run('DELETE FROM sessoes WHERE token_hash = ?', hashDoToken(token));
}

/**
 * Quem é o dono deste cookie? `null` se não houver sessão válida.
 *
 * Usa `db`, e não o pool cru: a consulta faz JOIN com `users`, que tem RLS.
 * Numa conexão sem empresa definida o join volta vazio e toda sessão pareceria
 * inválida — foi exatamente o que aconteceu na primeira versão. Quando isto
 * roda, `comEmpresa` já prendeu a conexão à empresa da requisição.
 */
export async function sessaoDe(token) {
  if (!token) return null;
  const s = await db.get(
    `SELECT s.tenant_id, s.user_id, s.expira_em,
            u.nome, u.email, u.papel, u.staff_id, u.ativo
       FROM sessoes s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`,
    hashDoToken(token)
  );
  if (!s) return null;

  // Expirada ou de alguém desativado: limpa e trata como deslogado.
  if (new Date(s.expira_em) < new Date() || !s.ativo) {
    await fecharSessao(token);
    return null;
  }
  return {
    tenantId: s.tenant_id,
    usuario: {
      id: s.user_id, nome: s.nome, email: s.email,
      papel: s.papel, profissionalId: s.staff_id || null,
    },
  };
}

export const opcoesDoCookie = () => ({
  httpOnly: true,                                   // JavaScript da página não lê
  sameSite: 'lax',                                  // corta CSRF vindo de outro site
  secure: process.env.NODE_ENV === 'production',    // só HTTPS quando publicado
  maxAge: DIAS * 864e5,
  path: '/',
});

export const NOME_COOKIE = COOKIE;

/* ------------------------------------------------------------------ *
 * Papéis
 * ------------------------------------------------------------------ */

/**
 * O que cada papel pode fazer. Uma tabela só, para a regra não se espalhar.
 *
 * `agendaDeOutros` é o que separa funcionário de gerente: ver e mexer na agenda
 * de quem não é você mesmo — inclusive bloquear horário alheio.
 */
export const PODERES = {
  dono:        { site: true,  financeiro: true,  cadastros: true,  equipe: true,  agendaDeOutros: true },
  gerente:     { site: false, financeiro: true,  cadastros: true,  equipe: true,  agendaDeOutros: true },
  funcionario: { site: false, financeiro: false, cadastros: false, equipe: false, agendaDeOutros: false },
};

export const pode = (papel, poder) => Boolean(PODERES[papel]?.[poder]);

/** Middleware: recusa quem não tem o poder pedido. */
export const exige = poder => (req, res, next) => {
  if (!req.usuario) return res.status(401).json({ erro: 'não autorizado' });
  if (!pode(req.usuario.papel, poder)) {
    return res.status(403).json({ erro: 'seu perfil não permite esta ação' });
  }
  next();
};

/** Cria o primeiro dono de uma empresa que ainda não tem ninguém. */
export async function criarPrimeiroDono({ nome, email, senha, tenantId }) {
  const { n } = await db.get('SELECT COUNT(*) n FROM users');
  if (n > 0) return { erro: 'esta empresa já tem usuários', codigo: 409 };
  const id = uid();
  await db.run(
    `INSERT INTO users (id, nome, email, senha_hash, papel, ativo, criado_em)
     VALUES (?,?,?,?,'dono',1,?)`,
    id, nome, String(email).toLowerCase().trim(), await hashDaSenha(senha),
    new Date().toISOString().slice(0, 10)
  );
  return { id };
}
