import crypto from 'node:crypto';
import { Router } from 'express';
import { db, uid, userOut, getConfig } from '../db.js';
import { rota } from '../lib/rota.js';
import { limite } from '../lib/limite.js';
import { enviarEmail } from '../lib/email.js';
import { mudancas } from '../lib/registro.js';
import {
  abrirSessao, fecharSessao, hashDaSenha, senhaConfere,
  NOME_COOKIE, opcoesDoCookie, exige, PODERES,
} from '../lib/auth.js';

export const auth = Router();

/**
 * Tentativas por IP e empresa. Login sem limite era chute de senha à vontade:
 * argon2 deixa cada tentativa lenta, mas não impede ninguém de tentar mil.
 * Generosos para quem erra a senha de verdade — e o salão inteiro sai pelo
 * mesmo IP.
 */
const LIMITES = {
  login: limite({ nome: 'login', max: 20, janelaSeg: 900 }),
  esqueci: limite({ nome: 'esqueci', max: 5, janelaSeg: 900 }),
  redefinir: limite({ nome: 'redefinir', max: 10, janelaSeg: 900 }),
};

const sha256 = t => crypto.createHash('sha256').update(t).digest('hex');

/**
 * Login.
 *
 * A resposta é a mesma para e-mail inexistente e senha errada, e a senha é
 * conferida mesmo quando o e-mail não existe. Sem isso, dá para descobrir quais
 * e-mails têm conta — pelo texto do erro ou pelo tempo de resposta, já que
 * argon2 é lento de propósito e a diferença é medível.
 */
auth.post('/login', LIMITES.login, rota(async (req, res) => {
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

/**
 * "Esqueci minha senha": manda por e-mail um link que vale uma hora e uma vez.
 *
 * A resposta é a mesma exista o e-mail ou não — senão a tela vira o jeito de
 * descobrir quem tem conta. Pelo mesmo motivo o e-mail sai sem esperar: o
 * envio é a parte lenta, e esperar por ele só quando a conta existe
 * denunciaria a conta pelo tempo de resposta.
 *
 * O link aponta para o endereço por onde o pedido chegou, que é o da empresa:
 * um `Host` que não fosse de empresa nenhuma já teria parado no middleware.
 */
auth.post('/esqueci', LIMITES.esqueci, rota(async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const resposta = { ok: true, mensagem: 'Se este e-mail tiver acesso ao painel, enviamos um link para criar uma senha nova. Ele vale por uma hora.' };
  if (!email.includes('@')) return res.json(resposta);

  const u = await db.get('SELECT id, nome, email FROM users WHERE email = ? AND ativo = 1', email);
  if (u) {
    const token = crypto.randomBytes(32).toString('base64url');
    // Um link valendo por vez: pedir de novo invalida o anterior.
    await db.run('DELETE FROM redefinicoes_senha WHERE user_id = ? AND usada_em IS NULL', u.id);
    await db.run(
      `INSERT INTO redefinicoes_senha (token_hash, user_id, expira_em) VALUES (?, ?, now() + interval '1 hour')`,
      sha256(token), u.id
    );
    const cfg = await getConfig();
    const link = `${req.protocol}://${req.get('host')}/painel.html#redefinir=${token}`;
    enviarEmail({
      para: u.email,
      assunto: `Senha do painel — ${cfg.nome}`,
      texto: `Oi, ${u.nome.split(' ')[0]}.\n\nAlguém pediu uma senha nova para o seu acesso ao painel de ${cfg.nome}. `
        + `Para criar, abra o link abaixo (vale por uma hora, uma vez só):\n\n${link}\n\n`
        + 'Se não foi você, ignore este e-mail: a senha atual continua valendo.',
    });
  }
  res.json(resposta);
}));

/**
 * Troca a senha com o link do e-mail. Derruba todas as sessões da pessoa:
 * quem pede senha nova pode estar fazendo isso justamente porque alguém
 * entrou na conta dela.
 */
auth.post('/redefinir', LIMITES.redefinir, rota(async (req, res) => {
  const { token, senha } = req.body || {};
  if (String(senha || '').length < 8) {
    return res.status(400).json({ erro: 'a senha precisa de ao menos 8 caracteres' });
  }
  const pedido = await db.get(
    `SELECT r.token_hash, u.id, u.nome FROM redefinicoes_senha r JOIN users u ON u.id = r.user_id
      WHERE r.token_hash = ? AND r.usada_em IS NULL AND r.expira_em > now() AND u.ativo = 1`,
    sha256(String(token || ''))
  );
  if (!pedido) {
    return res.status(400).json({ erro: 'este link venceu ou já foi usado. Peça outro em "Esqueci minha senha".' });
  }
  await db.run('UPDATE users SET senha_hash = ? WHERE id = ?', await hashDaSenha(senha), pedido.id);
  await db.run('UPDATE redefinicoes_senha SET usada_em = now() WHERE token_hash = ?', pedido.token_hash);
  await db.run('DELETE FROM sessoes WHERE user_id = ?', pedido.id);
  try {
    await db.opcional(() => db.run(
      `INSERT INTO logs (user_id, usuario_nome, acao, alvo_tipo, alvo_id, resumo, detalhe)
       VALUES (?,?,?,?,?,?,?)`,
      pedido.id, pedido.nome, 'acesso.senha_redefinida', 'acesso', pedido.id,
      'criou uma senha nova pelo link do e-mail', '{}'
    ));
  } catch (erro) {
    console.error('[registro] não consegui gravar:', erro.message);
  }
  res.json({ ok: true });
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
