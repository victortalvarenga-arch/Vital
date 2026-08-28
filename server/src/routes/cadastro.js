import { Router } from 'express';
import { db } from '../db.js';
import { rota } from '../lib/rota.js';
import { provisionarEmpresa, slugDe } from '../lib/provisionar.js';
import { criarPrimeiroDono } from '../lib/auth.js';

export const cadastro = Router();

/**
 * Cadastro de empresa nova, sem passar por nós.
 *
 * Fica fora de `/api/publico` e antes do middleware de empresa: é a única rota
 * do sistema que roda sem empresa nenhuma definida — é ela que cria uma. Todas
 * as outras precisam saber de quem é a requisição antes de tocar no banco.
 *
 * **Isto é a porta de entrada do produto e está aberta para a internet.** Antes
 * do primeiro cliente pagante, precisa de freio contra cadastro automatizado —
 * confirmação por e-mail ou captcha. Está anotado em `ROADMAP.md`, "Importante
 * para produção".
 */

/** Diz se um endereço está livre, para a tela avisar antes de enviar. */
cadastro.get('/endereco-livre', rota(async (req, res) => {
  const slug = slugDe(req.query.nome || '');
  const tomado = await db.get('SELECT 1 FROM plataforma.tenants WHERE slug = ?', slug);
  res.json({ slug, livre: !tomado });
}));

cadastro.post('/', rota(async (req, res) => {
  const b = req.body || {};

  if (String(b.nome || '').trim().length < 2) {
    return res.status(400).json({ erro: 'informe o nome do negócio' });
  }
  if (!b.email || !String(b.email).includes('@')) {
    return res.status(400).json({ erro: 'informe um e-mail válido' });
  }
  if (String(b.senha || '').length < 8) {
    return res.status(400).json({ erro: 'a senha precisa de ao menos 8 caracteres' });
  }
  if (String(b.responsavel || '').trim().length < 2) {
    return res.status(400).json({ erro: 'informe o seu nome' });
  }

  const empresa = await provisionarEmpresa({
    nome: b.nome, ramo: String(b.ramo || '').trim().slice(0, 60), slug: b.endereco,
  });
  if (empresa.erro) return res.status(400).json({ erro: empresa.erro });

  // O dono nasce junto: empresa sem ninguém que entre é empresa que não serve
  // para nada, e deixar isso para um segundo passo cria o estado intermediário
  // em que alguém pode reivindicá-la.
  const dono = await db.comEmpresa(empresa.id, () =>
    criarPrimeiroDono({ nome: b.responsavel, email: b.email, senha: b.senha, tenantId: empresa.id })
  );
  if (dono?.erro) return res.status(409).json({ erro: dono.erro });

  // Sem abrir sessão aqui, de propósito.
  //
  // O cadastro acontece no nosso endereço e a empresa passa a viver no dela.
  // Cookie é preso ao host que o emitiu — um cookie de `vital.app` não é
  // enviado para `lume.vital.app` —, então a sessão aberta aqui morreria no
  // primeiro passo. Dar um domínio amplo ao cookie (`.vital.app`) resolveria e
  // faria o token de uma empresa trafegar pelo endereço de todas as outras;
  // não vale o troco por poupar um login que a pessoa acabou de digitar a senha
  // para fazer.
  res.status(201).json({
    empresa: { id: empresa.id, nome: empresa.nome, endereco: empresa.slug },
    // Para onde a tela manda a pessoa em seguida.
    painel: enderecoDoPainel(req, empresa.slug),
  });
}));

/**
 * O endereço do painel da empresa recém-criada.
 *
 * `BASE_DOMINIO` é o domínio em que os subdomínios das empresas vivem. Sem ele
 * — desenvolvimento local, onde não há DNS —, devolve o caminho relativo, e a
 * pessoa continua na mesma origem.
 */
function enderecoDoPainel(req, slug) {
  const base = process.env.BASE_DOMINIO;
  return base ? `${req.protocol}://${slug}.${base}/painel.html` : '/painel.html';
}
