import { Router } from 'express';
import { db, getConfig, setConfig } from '../db.js';
import { rota } from '../lib/rota.js';
import { limite } from '../lib/limite.js';
import { soDigitos } from '../lib/dates.js';
import { abrirConversa, atender, mensagensDa } from '../atendente/motor.js';
import { chaveConfigurada, nomeDoModelo } from '../atendente/modelo.js';
import { ROTULOS } from '../atendente/saida.js';

export const atendente = Router();

/**
 * Painel do atendente por IA: configurar e testar.
 *
 * Montado com `exige('site')` em app.js — só quem configura o negócio liga a
 * IA, escolhe o modo e escreve o que ela sabe. O teste conversa com a IA de
 * verdade, mas em simulação: as ferramentas conferem tudo e não gravam nada
 * na agenda (`criarAgendamento` com `simular`).
 *
 * O teste custa dinheiro a cada mensagem (é a API da Anthropic de verdade),
 * por isso o limite por minuto.
 */

const MODOS = ['sombra', 'automatico'];
const MAX_INSTRUCOES = 4000;

const LIMITE_TESTE = limite({ nome: 'atendente-teste', max: 40, janelaSeg: 600 });

const mensagemParaTela = m => ({
  id: m.id, autor: m.autor, texto: m.texto, status: m.status, criadoEm: m.criado_em,
  revisao: {
    tentativas: m.revisao?.tentativas || 0,
    regras: (m.revisao?.regras || []).map(codigo => ({ codigo, rotulo: ROTULOS[codigo] || codigo })),
    juiz: Boolean(m.revisao?.juiz),
    seguro: Boolean(m.revisao?.seguro),
    equipe: m.revisao?.equipe ? { codigo: m.revisao.equipe, rotulo: ROTULOS[m.revisao.equipe] } : null,
  },
});

async function conversaParaTela(c) {
  if (!c) return null;
  return {
    id: c.id, canal: c.canal, fone: c.fone, estado: c.estado,
    motivo: c.motivo ? { codigo: c.motivo, rotulo: ROTULOS[c.motivo] || c.motivo } : null,
    mensagens: (await mensagensDa(c.id)).map(mensagemParaTela),
  };
}

atendente.get('/config', rota(async (req, res) => {
  const cfg = await getConfig();
  res.json({ ...cfg.atendente, chave: chaveConfigurada(), modelo: nomeDoModelo() });
}));

atendente.put('/config', rota(async (req, res) => {
  const b = req.body || {};
  const novo = {};
  if (b.ligado !== undefined) novo.ligado = b.ligado === true;
  if (b.modo !== undefined) {
    if (!MODOS.includes(b.modo)) return res.status(400).json({ erro: 'modo inválido' });
    novo.modo = b.modo;
  }
  if (b.instrucoes !== undefined) {
    const t = String(b.instrucoes || '');
    if (t.length > MAX_INSTRUCOES) {
      return res.status(400).json({ erro: `as instruções passam de ${MAX_INSTRUCOES} caracteres` });
    }
    novo.instrucoes = t.trim();
  }
  const salva = await setConfig({ atendente: novo });
  await req.registrar('atendente.config', {
    alvoId: 'atendente',
    resumo: `mudou o atendente por IA (${Object.keys(novo).join(', ') || 'nada'})`,
    detalhe: { ligado: salva.atendente.ligado, modo: salva.atendente.modo },
  });
  res.json({ ...salva.atendente, chave: chaveConfigurada(), modelo: nomeDoModelo() });
}));

/** A conversa de teste de quem está no painel — cada pessoa tem a sua. */
const conversaDeTeste = req => db.get(
  `SELECT * FROM conversas WHERE canal = 'teste' AND criado_por = ? ORDER BY criado_em DESC LIMIT 1`,
  req.usuario.id
);

atendente.get('/teste', rota(async (req, res) => {
  res.json(await conversaParaTela(await conversaDeTeste(req)));
}));

atendente.post('/teste', LIMITE_TESTE, rota(async (req, res) => {
  if (!chaveConfigurada()) {
    return res.status(503).json({ erro: 'a chave da Anthropic não está configurada no servidor (ANTHROPIC_API_KEY)' });
  }
  const texto = String(req.body?.texto || '').trim();
  if (!texto) return res.status(400).json({ erro: 'escreva uma mensagem' });

  const conversa = await abrirConversa({ canal: 'teste', criadoPor: req.usuario.id });
  // O teste pode fingir ser uma cliente cadastrada: o número escolhido é o
  // "quem está escrevendo". Só no canal de teste — no WhatsApp o número é o
  // de quem mandou, e não se escolhe.
  if (req.body?.fone !== undefined) {
    await db.run(`UPDATE conversas SET fone = ? WHERE id = ?`, soDigitos(req.body.fone), conversa.id);
  }
  const { conversa: depois } = await atender({ conversaId: conversa.id, texto, simular: true });
  res.json(await conversaParaTela(depois));
}));

atendente.delete('/teste', rota(async (req, res) => {
  await db.run(`DELETE FROM conversas WHERE canal = 'teste' AND criado_por = ?`, req.usuario.id);
  res.json(null);
}));

/**
 * Aprovar ou descartar uma sugestão do modo sombra. Só a sugestão muda de
 * estado; o que já foi enviado não volta atrás.
 */
for (const [acao, novo] of [['aprovar', 'enviada'], ['descartar', 'descartada']]) {
  atendente.post(`/mensagens/:id/${acao}`, rota(async (req, res) => {
    const m = await db.get(`SELECT * FROM conversa_mensagens WHERE id = ?`, req.params.id);
    if (!m) return res.status(404).json({ erro: 'mensagem não encontrada' });
    if (m.status !== 'sugerida') return res.status(409).json({ erro: 'esta mensagem não está esperando aprovação' });
    await db.run(`UPDATE conversa_mensagens SET status = ? WHERE id = ?`, novo, m.id);
    const c = await db.get('SELECT * FROM conversas WHERE id = ?', m.conversa_id);
    if (c.canal !== 'teste') {
      await req.registrar(`atendente.${acao}`, { alvoId: m.id, resumo: `${acao === 'aprovar' ? 'aprovou' : 'descartou'} uma resposta do atendente` });
    }
    res.json(await conversaParaTela(c));
  }));
}

/** A equipe assume (a IA para de responder) ou devolve a conversa para a IA. */
for (const [acao, estado] of [['assumir', 'equipe'], ['devolver', 'ia']]) {
  atendente.post(`/conversas/:id/${acao}`, rota(async (req, res) => {
    const c = await db.get('SELECT * FROM conversas WHERE id = ?', req.params.id);
    if (!c) return res.status(404).json({ erro: 'conversa não encontrada' });
    await db.run(`UPDATE conversas SET estado = ?, motivo = ? WHERE id = ?`,
      estado, estado === 'equipe' ? 'E02' : '', c.id);
    res.json(await conversaParaTela(await db.get('SELECT * FROM conversas WHERE id = ?', c.id)));
  }));
}
