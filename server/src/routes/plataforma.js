import { Router } from 'express';
import { db } from '../db.js';
import { rota } from '../lib/rota.js';
import { esquecerCacheDeEmpresas } from '../lib/tenant.js';
import {
  NOME_COOKIE_VITAL, opcoesDoCookieVital, PODERES_VITAL, podeNaPlataforma,
  entrarNaPlataforma, fecharSessaoVital, sessaoVitalDe, criarPrimeiroAdmin, registrar,
} from '../lib/plataforma.js';

export const plataforma = Router();

/**
 * Back-office da Vital: quem são as empresas-cliente e como elas estão.
 *
 * Fica fora do middleware de empresa, como o cadastro: aqui não se olha uma
 * empresa por vez, olha-se todas. E é por isso que quase tudo passa por
 * `plataforma.numeros_por_empresa()`, que devolve **só contagens** — o RLS
 * continua valendo para linha, e nome de cliente de ninguém sai por esta rota.
 */

/** Descobre quem da nossa equipe está falando. Não recusa; quem recusa é `exigeVital`. */
const identificarVital = rota(async (req, res, next) => {
  req.vital = await sessaoVitalDe(req.cookies?.[NOME_COOKIE_VITAL]);
  next();
});

function exigeVital(req, res, next) {
  if (!req.vital) return res.status(401).json({ erro: 'entre para continuar' });
  next();
}

const exigePoder = poder => (req, res, next) => {
  if (!podeNaPlataforma(req.vital?.papel, poder)) {
    return res.status(403).json({ erro: 'seu acesso não permite esta ação' });
  }
  next();
};

plataforma.use(identificarVital);

/* ── entrar ─────────────────────────────────────────────────────────────── */

plataforma.get('/precisa-configurar', rota(async (req, res) => {
  const { n } = await db.get('SELECT COUNT(*) n FROM plataforma.usuarios');
  res.json({ precisa: n === 0 });
}));

plataforma.post('/primeiro-acesso', rota(async (req, res) => {
  const { nome, email, senha } = req.body || {};
  if (!nome || !email || String(senha || '').length < 8) {
    return res.status(400).json({ erro: 'informe nome, e-mail e senha de ao menos 8 caracteres' });
  }
  const r = await criarPrimeiroAdmin({ nome, email, senha });
  if (r.erro) return res.status(409).json({ erro: r.erro });

  const entrada = await entrarNaPlataforma({ email, senha, agente: req.headers['user-agent'] });
  res.cookie(NOME_COOKIE_VITAL, entrada.token, opcoesDoCookieVital());
  await registrar({ usuarioId: r.id, acao: 'primeiro_acesso_plataforma' });
  res.status(201).json({ usuario: entrada.usuario, poderes: PODERES_VITAL.admin });
}));

plataforma.post('/login', rota(async (req, res) => {
  const { email, senha } = req.body || {};
  const r = await entrarNaPlataforma({ email, senha, agente: req.headers['user-agent'] });
  if (r.erro) return res.status(401).json({ erro: r.erro });

  res.cookie(NOME_COOKIE_VITAL, r.token, opcoesDoCookieVital());
  res.json({ usuario: r.usuario, poderes: PODERES_VITAL[r.usuario.papel] });
}));

plataforma.post('/sair', rota(async (req, res) => {
  await fecharSessaoVital(req.cookies?.[NOME_COOKIE_VITAL]);
  res.clearCookie(NOME_COOKIE_VITAL, { ...opcoesDoCookieVital(), maxAge: undefined });
  res.json({ ok: true });
}));

plataforma.get('/eu', exigeVital, rota(async (req, res) => {
  res.json({ usuario: req.vital, poderes: PODERES_VITAL[req.vital.papel] });
}));

/* ── as empresas ────────────────────────────────────────────────────────── */

plataforma.get('/empresas', exigeVital, exigePoder('verEmpresas'), rota(async (req, res) => {
  const linhas = await db.all(
    `SELECT id, slug, nome, dominio, plano, status, ativo, criado_em
       FROM plataforma.tenants ORDER BY criado_em DESC, nome`
  );
  // Uma chamada só para os números de todas: contar empresa por empresa com
  // `comEmpresa` seriam quatro consultas por linha da tela.
  const numeros = await db.all('SELECT * FROM plataforma.numeros_por_empresa()');
  const porId = new Map(numeros.map(n => [n.tenant_id, n]));

  res.json(linhas.map(t => {
    const n = porId.get(t.id) || {};
    return {
      id: t.id, slug: t.slug, nome: t.nome, dominio: t.dominio || null,
      // O endereço navegável, montado aqui porque só o servidor sabe em que
      // domínio as empresas vivem. Em desenvolvimento não há `BASE_DOMINIO`, e
      // `<slug>.localhost` resolve sozinho no navegador — é como se abre o site
      // de uma segunda empresa sem DNS nenhum.
      url: enderecoDe(req, t),
      plano: t.plano, status: t.status, ativo: !!t.ativo, desde: t.criado_em,
      clientes: n.clientes ?? 0,
      profissionais: n.profissionais ?? 0,
      servicos: n.servicos ?? 0,
      agendamentosNoMes: n.agendamentos_mes ?? 0,
      ultimoMovimento: n.ultimo_movimento || null,
    };
  }));
}));

/**
 * De onde a empresa é acessível, do ponto de vista de quem está olhando a tela.
 *
 * Domínio próprio ganha da nossa base. Sem `BASE_DOMINIO` — desenvolvimento —,
 * o subdomínio de `localhost` na mesma porta de onde veio a requisição.
 */
function enderecoDe(req, t) {
  if (t.dominio) return `${req.protocol}://${t.dominio}`;
  const base = process.env.BASE_DOMINIO;
  if (base) return `${req.protocol}://${t.slug}.${base}`;
  // `req.headers.host` traz a porta; `req.hostname`, não — e é a porta do Vite
  // que importa aqui, não a da API.
  const porta = String(req.headers.origin || req.headers.referer || '').match(/:(\d+)/)?.[1];
  return `http://${t.slug}.localhost${porta ? ':' + porta : ''}`;
}

plataforma.get('/resumo', exigeVital, exigePoder('verEmpresas'), rota(async (req, res) => {
  const t = await db.get(
    `SELECT COUNT(*) total,
            COUNT(*) FILTER (WHERE ativo = 1 AND status = 'ativa') ativas,
            COUNT(*) FILTER (WHERE status = 'suspensa') suspensas
       FROM plataforma.tenants`
  );
  const numeros = await db.all('SELECT * FROM plataforma.numeros_por_empresa()');
  const somar = campo => numeros.reduce((s, n) => s + Number(n[campo] || 0), 0);

  const porPlano = await db.all(
    `SELECT plano, COUNT(*) n FROM plataforma.tenants GROUP BY plano ORDER BY plano`
  );

  res.json({
    empresas: { total: Number(t.total), ativas: Number(t.ativas), suspensas: Number(t.suspensas) },
    porPlano: porPlano.map(p => ({ plano: p.plano, empresas: Number(p.n) })),
    clientesFinais: somar('clientes'),
    agendamentosNoMes: somar('agendamentos_mes'),
    // Empresa que nunca teve agendamento é a que corre risco de cancelar antes
    // de virar cliente de verdade — é o número que diz se o produto pegou.
    semNenhumAgendamento: numeros.filter(n => !n.ultimo_movimento).length,
  });
}));

/* ── suspender e reativar ───────────────────────────────────────────────── */

/**
 * Suspender não apaga nada: o site da empresa passa a responder 403 e o painel
 * dela também, porque a checagem vive no middleware que resolve a empresa. É
 * reversível, e o registro na auditoria diz quem fez e por quê.
 */
plataforma.post('/empresas/:id/status', exigeVital, exigePoder('suspender'), rota(async (req, res) => {
  const { status, motivo } = req.body || {};
  if (!['ativa', 'suspensa', 'cancelada'].includes(status)) {
    return res.status(400).json({ erro: 'status inválido' });
  }
  const alvo = await db.get('SELECT id, nome, status FROM plataforma.tenants WHERE id = ?', req.params.id);
  if (!alvo) return res.status(404).json({ erro: 'empresa não encontrada' });

  await db.run(
    `UPDATE plataforma.tenants SET status = ?, ativo = ? WHERE id = ?`,
    status, status === 'ativa' ? 1 : 0, req.params.id
  );
  await registrar({
    usuarioId: req.vital.id, tenantId: alvo.id, acao: `status_${status}`,
    detalhe: { de: alvo.status, para: status, motivo: String(motivo || '').slice(0, 300) },
  });

  // A resolução de host guarda a empresa por um minuto; sem isto, a suspensão
  // só valeria depois que o cache vencesse.
  esquecerCacheDeEmpresas();
  res.json({ ok: true, status });
}));

plataforma.patch('/empresas/:id/plano', exigeVital, exigePoder('suspender'), rota(async (req, res) => {
  const plano = String(req.body?.plano || '').trim().slice(0, 40);
  if (!plano) return res.status(400).json({ erro: 'informe o plano' });

  const alvo = await db.get('SELECT id, plano FROM plataforma.tenants WHERE id = ?', req.params.id);
  if (!alvo) return res.status(404).json({ erro: 'empresa não encontrada' });

  await db.run('UPDATE plataforma.tenants SET plano = ? WHERE id = ?', plano, req.params.id);
  await registrar({
    usuarioId: req.vital.id, tenantId: alvo.id, acao: 'plano',
    detalhe: { de: alvo.plano, para: plano },
  });
  res.json({ ok: true, plano });
}));

/* ── o rastro ───────────────────────────────────────────────────────────── */

plataforma.get('/auditoria', exigeVital, exigePoder('verEmpresas'), rota(async (req, res) => {
  const cond = [], args = [];
  if (req.query.empresaId) { cond.push('a.tenant_id = ?'); args.push(req.query.empresaId); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';

  const linhas = await db.all(
    `SELECT a.id, a.acao, a.detalhe, a.criado_em, a.tenant_id,
            u.nome AS usuario, t.nome AS empresa
       FROM plataforma.auditoria a
       LEFT JOIN plataforma.usuarios u ON u.id = a.usuario_id
       LEFT JOIN plataforma.tenants  t ON t.id = a.tenant_id
       ${where}
      ORDER BY a.criado_em DESC LIMIT 200`,
    ...args
  );
  res.json(linhas.map(l => ({
    id: Number(l.id), acao: l.acao, detalhe: l.detalhe, quando: l.criado_em,
    usuario: l.usuario || 'sistema', empresa: l.empresa || null, empresaId: l.tenant_id,
  })));
}));
