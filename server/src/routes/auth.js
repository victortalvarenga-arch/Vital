import { Router } from 'express';
import { db, uid, userOut } from '../db.js';
import { rota } from '../lib/rota.js';
import {
  abrirSessao, fecharSessao, hashDaSenha, senhaConfere,
  NOME_COOKIE, opcoesDoCookie, exige, PODERES,
} from '../lib/auth.js';

export const auth = Router();

/**
 * Login.
 *
 * A resposta é a mesma para e-mail inexistente e senha errada, e a senha é
 * conferida mesmo quando o e-mail não existe. Sem isso, dá para descobrir quais
 * e-mails têm conta — pelo texto do erro ou pelo tempo de resposta, já que
 * argon2 é lento de propósito e a diferença é medível.
 */
auth.post('/login', rota(async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const senha = String(req.body?.senha || '');
  const generico = { erro: 'e-mail ou senha incorretos' };
  if (!email || !senha) return res.status(400).json(generico);

  const u = await db.get('SELECT * FROM users WHERE email = ? AND ativo = 1', email);
  // Hash descartável: mantém o tempo de resposta parecido quando não há usuário.
  const hash = u?.senha_hash || '$argon2id$v=19$m=65536,t=3,p=4$c2Fs$aW52YWxpZG8';
  const ok = await senhaConfere(hash, senha);
  if (!u || !ok) return res.status(401).json(generico);

  const { token } = await abrirSessao({
    userId: u.id, tenantId: req.tenantId, agente: req.headers['user-agent'],
  });
  await db.run('UPDATE users SET ultimo_login = ? WHERE id = ?',
    new Date().toISOString().slice(0, 16).replace('T', ' '), u.id);

  res.cookie(NOME_COOKIE, token, opcoesDoCookie());
  res.json({ usuario: userOut(u), poderes: PODERES[u.papel] });
}));

auth.post('/sair', rota(async (req, res) => {
  await fecharSessao(req.cookies?.[NOME_COOKIE]);
  res.clearCookie(NOME_COOKIE, { ...opcoesDoCookie(), maxAge: undefined });
  res.json({ ok: true });
}));

/** Quem está logado. O painel chama isto no boot para decidir o que mostrar. */
auth.get('/eu', rota(async (req, res) => {
  if (!req.usuario) return res.status(401).json({ erro: 'não autenticado' });
  res.json({ usuario: req.usuario, poderes: PODERES[req.usuario.papel] });
}));

/**
 * Primeiro acesso: a empresa sem nenhum usuário cria o dono.
 *
 * Aberta de propósito, e fechada sozinha assim que existir um usuário — é a
 * única forma de a primeira pessoa entrar. Depois disso, só o dono convida.
 */
auth.get('/precisa-configurar', rota(async (req, res) => {
  const { n } = await db.get('SELECT COUNT(*) n FROM users');
  res.json({ precisa: n === 0 });
}));

auth.post('/primeiro-acesso', rota(async (req, res) => {
  const { nome, email, senha } = req.body || {};
  if (!nome || !email || String(senha || '').length < 8) {
    return res.status(400).json({ erro: 'informe nome, e-mail e senha de ao menos 8 caracteres' });
  }
  const { n } = await db.get('SELECT COUNT(*) n FROM users');
  if (n > 0) return res.status(409).json({ erro: 'esta empresa já tem usuários' });

  const id = uid();
  await db.run(
    `INSERT INTO users (id, nome, email, senha_hash, papel, ativo, criado_em)
     VALUES (?,?,?,?,'dono',1,?)`,
    id, nome, String(email).toLowerCase().trim(), await hashDaSenha(senha),
    new Date().toISOString().slice(0, 10)
  );

  const { token } = await abrirSessao({ userId: id, tenantId: req.tenantId, agente: req.headers['user-agent'] });
  res.cookie(NOME_COOKIE, token, opcoesDoCookie());
  const u = await db.get('SELECT * FROM users WHERE id = ?', id);
  res.status(201).json({ usuario: userOut(u), poderes: PODERES['dono'] });
}));

/* ── equipe do painel: quem entra e com qual papel ── */

auth.get('/usuarios', exige('equipe'), rota(async (req, res) => {
  const rows = await db.all('SELECT * FROM users ORDER BY nome');
  res.json(rows.map(userOut));
}));

auth.post('/usuarios', exige('equipe'), rota(async (req, res) => {
  const { nome, email, senha, papel, profissionalId } = req.body || {};
  if (!nome || !email || String(senha || '').length < 8) {
    return res.status(400).json({ erro: 'informe nome, e-mail e senha de ao menos 8 caracteres' });
  }
  if (!PODERES[papel]) return res.status(400).json({ erro: 'papel inválido' });
  // Só dono cria outro dono: gerente promovendo alguém a dono contornaria o
  // próprio limite dele.
  if (papel === 'dono' && req.usuario.papel !== 'dono') {
    return res.status(403).json({ erro: 'só o dono pode criar outro dono' });
  }

  const existe = await db.get('SELECT id FROM users WHERE email = ?', String(email).toLowerCase().trim());
  if (existe) return res.status(409).json({ erro: 'já existe alguém com esse e-mail' });

  const id = uid();
  await db.run(
    `INSERT INTO users (id, nome, email, senha_hash, papel, staff_id, ativo, criado_em)
     VALUES (?,?,?,?,?,?,1,?)`,
    id, nome, String(email).toLowerCase().trim(), await hashDaSenha(senha),
    papel, profissionalId || null, new Date().toISOString().slice(0, 10)
  );
  res.status(201).json(userOut(await db.get('SELECT * FROM users WHERE id = ?', id)));
}));

auth.put('/usuarios/:id', exige('equipe'), rota(async (req, res) => {
  const alvo = await db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!alvo) return res.status(404).json({ erro: 'usuário não encontrado' });
  const b = req.body || {};

  if (b.papel && !PODERES[b.papel]) return res.status(400).json({ erro: 'papel inválido' });
  if ((b.papel === 'dono' || alvo.papel === 'dono') && req.usuario.papel !== 'dono') {
    return res.status(403).json({ erro: 'só o dono mexe em outro dono' });
  }
  // Desligar a si mesmo tranca a pessoa para fora do próprio painel.
  if (alvo.id === req.usuario.id && b.ativo === false) {
    return res.status(400).json({ erro: 'você não pode desativar a própria conta' });
  }

  await db.run(
    `UPDATE users SET nome=?, papel=?, staff_id=?, ativo=? WHERE id=?`,
    b.nome ?? alvo.nome,
    b.papel ?? alvo.papel,
    b.profissionalId !== undefined ? (b.profissionalId || null) : alvo.staff_id,
    b.ativo === false ? 0 : 1,
    req.params.id
  );

  if (b.senha) {
    if (String(b.senha).length < 8) return res.status(400).json({ erro: 'senha de ao menos 8 caracteres' });
    await db.run('UPDATE users SET senha_hash = ? WHERE id = ?', await hashDaSenha(b.senha), req.params.id);
    // Trocar a senha derruba as outras sessões: é o que se espera quando a
    // troca acontece porque a senha vazou.
    await db.run('DELETE FROM sessoes WHERE user_id = ?', req.params.id);
  }

  res.json(userOut(await db.get('SELECT * FROM users WHERE id = ?', req.params.id)));
}));
