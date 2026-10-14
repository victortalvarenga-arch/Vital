import crypto from 'node:crypto';
import express, { Router } from 'express';
import { db, setConfig } from '../db.js';
import { rota } from '../lib/rota.js';
import { assinarEstado, conferirEstado, segredoConfigurado } from '../lib/segredo.js';
import {
  provedor, urlDeRetorno, gravarConexao, sincronizar, desconectar, situacoes, escolherFicha,
} from '../conexoes/index.js';

const NOMES = { google: 'Google', instagram: 'Instagram' };

/* ------------------------------------------------------------------ *
 * Painel: montado com login e `exige('site')` em app.js
 * ------------------------------------------------------------------ */

export const conexoes = Router();

conexoes.get('/', rota(async (req, res) => res.json(await situacoes())));

/**
 * Devolve o endereço da tela de autorização do provedor; o painel navega para
 * ele. `voltar` é a página do painel para onde a pessoa retorna no fim.
 */
conexoes.post('/:provedor/iniciar', rota(async (req, res) => {
  const p = provedor(req.params.provedor);
  if (!p) return res.status(404).json({ erro: 'conexão desconhecida' });
  if (!p.configurado() || !segredoConfigurado()) {
    return res.status(503).json({ erro: `A conexão com o ${NOMES[p.nome]} ainda não foi ativada pela Vital.` });
  }

  // Só volta para o próprio endereço da empresa. Sem isto, o retorno — que é
  // um redirecionamento num domínio nosso — viraria um redirecionador aberto
  // para qualquer site que alguém escrevesse aqui.
  let voltar;
  try { voltar = new URL(String(req.body?.voltar || '')); } catch { voltar = null; }
  if (!voltar || !['http:', 'https:'].includes(voltar.protocol) || voltar.hostname !== req.hostname) {
    return res.status(400).json({ erro: 'endereço de volta inválido' });
  }

  const estado = assinarEstado({
    t: req.tenantId, p: p.nome, u: req.usuario.id, v: voltar.toString(),
  });
  res.json({ url: p.urlDeAutorizacao({ estado, retorno: urlDeRetorno(p.nome) }) });
}));

conexoes.post('/:provedor/sincronizar', rota(async (req, res) => {
  if (!provedor(req.params.provedor)) return res.status(404).json({ erro: 'conexão desconhecida' });
  const r = await sincronizar(req.params.provedor);
  if (!r.ok) return res.status(502).json({ erro: r.erro });
  res.json(r);
}));

conexoes.put('/google/ficha', rota(async (req, res) => {
  if (!await escolherFicha(String(req.body?.ficha || ''))) {
    return res.status(400).json({ erro: 'ficha não encontrada nesta conta do Google' });
  }
  await req.registrar('conexao.ficha', { alvoId: 'google', resumo: 'escolheu a ficha do Google que aparece no site' });
  const r = await sincronizar('google');
  res.json(r);
}));

conexoes.delete('/:provedor', rota(async (req, res) => {
  const nome = req.params.provedor;
  if (!provedor(nome)) return res.status(404).json({ erro: 'conexão desconhecida' });
  if (!await desconectar(nome)) return res.status(404).json({ erro: 'não estava conectado' });
  await req.registrar('conexao.removida', { alvoId: nome, resumo: `desconectou o ${NOMES[nome]}` });
  res.json({ ok: true });
}));

/* ------------------------------------------------------------------ *
 * Retorno dos provedores: SEM empresa definida pelo endereço
 * ------------------------------------------------------------------ */

/**
 * Montado antes de `comEmpresa` em app.js, como o cadastro: o Google e a Meta
 * devolvem a pessoa a um endereço só, cadastrado no console deles, e o `Host`
 * desse retorno não é o da empresa. Quem diz de qual empresa é o `state`
 * assinado, e daqui em diante é ele que vale.
 */
export const retornoOauth = Router();

const comParametros = (url, params) => {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
};

retornoOauth.get('/:provedor/retorno', rota(async (req, res) => {
  const p = provedor(req.params.provedor);
  const dados = conferirEstado(req.query.state);
  if (!p || !dados || dados.p !== p.nome) {
    return res.status(400).type('text/plain; charset=utf-8')
      .send('Este link de autorização venceu ou não é válido. Volte ao painel e clique em "Conectar" de novo.');
  }
  const volta = resultado => res.redirect(comParametros(dados.v, { conexao: p.nome, resultado }));

  // Recusou na tela do provedor: volta sem gravar nada.
  if (req.query.error || !req.query.code) return volta('cancelado');

  // Empresa suspensa entre o clique e o retorno não ganha conexão nova.
  const empresa = await db.get('SELECT status, ativo FROM plataforma.tenants WHERE id = ?', dados.t);
  if (!empresa || !empresa.ativo || empresa.status !== 'ativa') return volta('erro');

  let resultado = 'ok';
  await db.comEmpresa(dados.t, async () => {
    try {
      const obtido = await p.trocarCodigo({ codigo: String(req.query.code), retorno: urlDeRetorno(p.nome) });
      await gravarConexao(p.nome, obtido, { usuarioId: dados.u });
      await registrarConexao(dados.u, p.nome, obtido.conta);
      if (obtido.situacao === 'ok') {
        const s = await sincronizar(p.nome);
        if (!s.ok) resultado = 'erro';
      } else {
        resultado = obtido.situacao === 'escolher' ? 'escolher' : 'erro';
      }
    } catch (erro) {
      console.error(`[conexoes] retorno ${p.nome} na empresa ${dados.t}:`, erro.message);
      resultado = 'erro';
    }
  });
  volta(resultado);
}));

/**
 * Registro feito à mão: o retorno chega fora da sessão do painel (outro
 * endereço, sem cookie), então `req.registrar` não sabe quem é. Quem clicou
 * em "Conectar" está no `state` assinado.
 */
async function registrarConexao(usuarioId, nome, conta) {
  try {
    const u = await db.get('SELECT nome FROM users WHERE id = ?', usuarioId);
    await db.opcional(() => db.run(
      `INSERT INTO logs (user_id, usuario_nome, acao, alvo_tipo, alvo_id, resumo, detalhe)
       VALUES (?,?,?,?,?,?,?)`,
      u ? usuarioId : null, u?.nome || '', 'conexao.criada', 'conexao', nome,
      `conectou o ${NOMES[nome]}${conta ? ` (${conta})` : ''}`, '{}'
    ));
  } catch (erro) {
    console.error('[registro] não consegui gravar:', erro.message);
  }
}

/* ------------------------------------------------------------------ *
 * Avisos da Meta: a dona tirou o acesso, ou pediu para apagar os dados
 * ------------------------------------------------------------------ */

/**
 * A Meta exige as duas URLs no cadastro do app. Chegam com um
 * `signed_request` assinado com o segredo do app — sem conferir a assinatura,
 * qualquer um derrubaria a conexão de qualquer empresa.
 */
function lerSignedRequest(bruto) {
  const segredo = process.env.INSTAGRAM_APP_SECRET || '';
  const [sig, corpo] = String(bruto || '').split('.');
  if (!segredo || !sig || !corpo) return null;
  const esperada = crypto.createHmac('sha256', segredo).update(corpo).digest();
  const recebida = Buffer.from(sig, 'base64url');
  if (recebida.length !== esperada.length || !crypto.timingSafeEqual(recebida, esperada)) return null;
  try { return JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')); } catch { return null; }
}

/**
 * Apaga a conexão do Instagram de quem a Meta disse, em qualquer empresa.
 *
 * Percorre empresa por empresa porque `conexoes` tem RLS e o aviso não diz de
 * qual empresa é — só o id da pessoa na Meta. É raro e barato.
 */
async function esquecerContaDoInstagram(idMeta) {
  const empresas = await db.all(`SELECT id FROM plataforma.tenants WHERE ativo = 1 ORDER BY id`);
  for (const { id } of empresas) {
    await db.comEmpresa(id, async () => {
      const apagou = await db.run(
        `DELETE FROM conexoes WHERE provedor = 'instagram' AND extra->>'idMeta' = ?`, String(idMeta)
      );
      if (apagou) await setConfig({ instagramPosts: [] });
    });
  }
}

const formulario = express.urlencoded({ extended: false });

retornoOauth.post('/instagram/desautorizar', formulario, rota(async (req, res) => {
  const dados = lerSignedRequest(req.body?.signed_request);
  if (!dados?.user_id) return res.status(400).json({ erro: 'assinatura inválida' });
  await esquecerContaDoInstagram(dados.user_id);
  res.json({ ok: true });
}));

retornoOauth.post('/instagram/apagar-dados', formulario, rota(async (req, res) => {
  const dados = lerSignedRequest(req.body?.signed_request);
  if (!dados?.user_id) return res.status(400).json({ erro: 'assinatura inválida' });
  await esquecerContaDoInstagram(dados.user_id);
  const codigo = crypto.randomBytes(8).toString('hex');
  const base = urlDeRetorno('instagram').replace(/\/retorno$/, '');
  res.json({ url: `${base}/apagar-dados/${codigo}`, confirmation_code: codigo });
}));

// A Meta mostra este endereço à pessoa como comprovante. O apagamento já
// aconteceu no pedido; não há estado a consultar.
retornoOauth.get('/instagram/apagar-dados/:codigo', (req, res) => {
  res.type('text/plain; charset=utf-8')
    .send(`Pedido ${req.params.codigo.slice(0, 16)}: a conexão com o Instagram e as publicações copiadas foram apagadas.`);
});
