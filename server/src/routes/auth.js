import { Router } from 'express';
import { db, uid, userOut, getConfig } from '../db.js';
import { rota } from '../lib/rota.js';
import { mudancas } from '../lib/registro.js';
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
  // O nome vai junto porque cada empresa vive num endereço próprio agora: sem
  // ele, quem abre o painel não sabe em qual empresa está tentando entrar — e
  // errar de endereço passa a ser um erro fácil de cometer.
  const cfg = await getConfig();
  res.json({ precisa: n === 0, empresa: cfg.nome });
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
  // Funcionário enxerga "o que é meu" — a própria agenda, a própria produção.
  // Sem dizer quem ele é na equipe, "o meu" não tem resposta e ele entra num
  // painel vazio sem entender por quê.
  if (papel === 'funcionario' && !profissionalId) {
    return res.status(400).json({ erro: 'escolha qual profissional da equipe é esta pessoa' });
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
  await req.registrar('acesso.criado', {
    alvoId: id, alvoTipo: 'acesso',
    resumo: `deu acesso de ${papel} a ${nome}`,
    detalhe: { email: String(email).toLowerCase().trim(), papel },
  });
  res.status(201).json(userOut(await db.get('SELECT * FROM users WHERE id = ?', id)));
}));

/**
 * Remove alguém do painel de vez.
 *
 * Existe além do "desativar" porque são coisas diferentes: desativar guarda o
 * histórico de quem era — útil quando a pessoa pode voltar —, e apagar serve
 * para conta criada por engano ou para teste. As sessões vão junto por cascata.
 *
 * O que a pessoa fez na agenda não se perde: `appointments` aponta para `staff`,
 * não para `users`. Apagar o login não apaga atendimento nem comissão.
 */
auth.delete('/usuarios/:id', exige('equipe'), rota(async (req, res) => {
  const alvo = await db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!alvo) return res.status(404).json({ erro: 'usuário não encontrado' });

  if (alvo.id === req.usuario.id) {
    return res.status(400).json({ erro: 'você não pode apagar a própria conta' });
  }
  if (alvo.papel === 'dono') {
    const { n } = await db.get(`SELECT COUNT(*) n FROM users WHERE papel='dono' AND ativo=1`);
    if (n <= 1) return res.status(400).json({ erro: 'esta é a única conta de dono ativa' });
  }

  await db.run('DELETE FROM users WHERE id = ?', req.params.id);
  // Tirar o acesso de alguém é a ação mais sensível do painel: quem fez fica
  // registrado antes de a resposta sair.
  await req.registrar('acesso.removido', {
    alvoId: alvo.id, alvoTipo: 'acesso',
    resumo: `removeu o acesso de ${alvo.nome}`,
    detalhe: { email: alvo.email, papel: alvo.papel },
  });
  res.json({ ok: true });
}));

auth.put('/usuarios/:id', exige('equipe'), rota(async (req, res) => {
  const alvo = await db.get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!alvo) return res.status(404).json({ erro: 'usuário não encontrado' });
  const b = req.body || {};

  if (b.papel && !PODERES[b.papel]) return res.status(400).json({ erro: 'papel inválido' });

  const papelFinal = b.papel ?? alvo.papel;
  const vinculoFinal = b.profissionalId !== undefined ? b.profissionalId : alvo.staff_id;

  // As travas de "não se tranque para fora" vêm ANTES da validação de vínculo:
  // quem tenta se rebaixar precisa ler o motivo real, não um pedido de
  // preencher campo que nem deveria estar preenchendo.
  if (alvo.id === req.usuario.id && b.ativo === false) {
    return res.status(400).json({ erro: 'você não pode desativar a própria conta' });
  }
  if (alvo.id === req.usuario.id && papelFinal !== alvo.papel) {
    return res.status(400).json({ erro: 'você não pode mudar o próprio nível de acesso' });
  }
  // Sempre precisa sobrar um dono ativo, senão a empresa perde o painel.
  if (alvo.papel === 'dono' && (papelFinal !== 'dono' || b.ativo === false)) {
    const { n } = await db.get(`SELECT COUNT(*) n FROM users WHERE papel='dono' AND ativo=1`);
    if (n <= 1) return res.status(400).json({ erro: 'esta é a única conta de dono ativa' });
  }

  if (papelFinal === 'funcionario' && !vinculoFinal) {
    return res.status(400).json({ erro: 'escolha qual profissional da equipe é esta pessoa' });
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

  const depois = userOut(await db.get('SELECT * FROM users WHERE id = ?', req.params.id));
  const mudou = mudancas(userOut(alvo), depois, ['nome', 'papel', 'ativo', 'profissionalId']);
  if (b.senha) mudou.senha = ['—', 'trocada'];
  if (Object.keys(mudou).length) {
    await req.registrar('acesso.alterado', {
      alvoId: depois.id, alvoTipo: 'acesso',
      resumo: `alterou o acesso de ${depois.nome} (${Object.keys(mudou).join(', ')})`,
      detalhe: mudou,
    });
  }
  res.json(depois);
}));
