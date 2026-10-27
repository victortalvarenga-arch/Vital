import { db, uid, getConfig, listarServicos, listarUnidades } from '../db.js';
import { soDigitos } from '../lib/dates.js';
import { classificarEntrada, VAI_PARA_EQUIPE } from './entrada.js';
import { revisarResposta, acaoPara, ROTULOS } from './saida.js';
import { JUIZ_SISTEMA, JUIZ_ESQUEMA, pedidoAoJuiz, precisaDeJuiz, achadosDoJuiz } from './juiz.js';
import { DEFINICOES, executar, agoraNaClinica } from './ferramentas.js';
import { informacoesDaClinica, parteFixa, parteDoMomento, montarSistema, pedidoDeCorrecao } from './prompt.js';
import { responder, julgar } from './modelo.js';
import { juntarFatos, normalizar } from './texto.js';

/**
 * O atendente: recebe a mensagem da cliente e decide o que responder.
 *
 *   entrada → (urgência, pedido de humano, reclamação) → texto fixo + equipe
 *           → IA com ferramentas → revisão → juiz (se for o caso)
 *               → passou: grava a resposta
 *               → erro: UMA nova tentativa, com o problema apontado
 *               → crítico ou segunda reprovação: texto fixo + equipe
 *
 * O texto fixo de reserva é escrito por gente e não passa por IA nenhuma — é o
 * que sai quando nada mais é confiável (`safe-block` do `genera_genui`).
 *
 * Em modo sombra a resposta nasce `sugerida` e só conta como dita quando a
 * equipe aprova; em automático, nasce `enviada`. Quem entrega no WhatsApp é
 * quem chamou (a rota, ou o webhook quando existir), não este módulo.
 *
 * **Nunca loga conteúdo.** A linha de log leva códigos de regra, contagens e
 * tempo — o texto da conversa mora só na tabela, com RLS.
 */

export const TEXTOS_SEGUROS = {
  E01: 'Sinto muito que você esteja passando por isso. Já avisei a nossa equipe, e alguém vai falar com você o quanto antes. Se piorar — falta de ar, inchaço que aumenta —, procure um pronto-atendimento ou ligue 192.',
  E02: 'Claro! Vou chamar alguém da equipe para falar com você. Só um instante.',
  E03: 'Sinto muito por isso. Vou passar a sua mensagem para a nossa equipe, que vai te responder pessoalmente.',
  E04: 'Vou chamar alguém da equipe para te ajudar com isso. Só um instante.',
  E05: 'Vou pedir para alguém da equipe te responder sobre isso. Só um instante.',
};

const CODIGO_DA_ENTRADA = { urgencia: 'E01', humano: 'E02', reclamacao: 'E03' };
const MAX_VOLTAS = 8;
const MAX_HISTORICO = 30;

/* ── conversas ── */

/** A conversa aberta deste número neste canal, ou uma nova. */
export async function abrirConversa({ canal, fone = '', criadoPor = '' }) {
  const digitos = soDigitos(fone);
  const existente = canal === 'teste'
    ? await db.get(`SELECT * FROM conversas WHERE canal = 'teste' AND criado_por = ? ORDER BY criado_em DESC LIMIT 1`, criadoPor)
    : await db.get(`SELECT * FROM conversas WHERE canal = ? AND fone = ? ORDER BY criado_em DESC LIMIT 1`, canal, digitos);
  if (existente) return existente;
  const id = uid();
  await db.run(`INSERT INTO conversas (id, canal, fone, criado_por) VALUES (?,?,?,?)`, id, canal, digitos, criadoPor);
  return db.get('SELECT * FROM conversas WHERE id = ?', id);
}

export async function mensagensDa(conversaId) {
  return db.all(
    `SELECT * FROM conversa_mensagens WHERE conversa_id = ? ORDER BY criado_em, id`, conversaId
  );
}

async function gravar(conversaId, autor, texto, status = 'enviada', revisao = {}) {
  const id = uid();
  await db.run(
    `INSERT INTO conversa_mensagens (id, conversa_id, autor, texto, status, revisao) VALUES (?,?,?,?,?,?)`,
    id, conversaId, autor, texto, status, JSON.stringify(revisao)
  );
  await db.run(`UPDATE conversas SET atualizado_em = clock_timestamp() WHERE id = ?`, conversaId);
  return db.get('SELECT * FROM conversa_mensagens WHERE id = ?', id);
}

async function passarParaEquipe(conversa, codigo, status, revisao) {
  await db.run(`UPDATE conversas SET estado = 'equipe', motivo = ? WHERE id = ?`, codigo, conversa.id);
  return gravar(conversa.id, 'ia', TEXTOS_SEGUROS[codigo], status, { ...revisao, equipe: codigo, seguro: true });
}

/* ── fontes ── */

/**
 * O que esta clínica permite dizer: informações, catálogo e equipe.
 * Vai à revisão como fonte — preço do catálogo pode sair mesmo que a IA o
 * tenha lido numa volta anterior, porque veio do sistema do mesmo jeito.
 */
async function fontesDaClinica(cfg) {
  const unidades = await listarUnidades({ somenteAtivas: true });
  const informacoes = informacoesDaClinica(cfg, { unidades });
  const servicos = await listarServicos({ somenteAtivos: true });
  const equipe = await db.all('SELECT nome FROM staff WHERE ativo = 1');
  const catalogo = [
    ...servicos.map(s => `${s.nome} ${s.categoria || ''} ${s.descricao || ''} ${s.duracao} min ${s.preco}`),
    ...equipe.map(p => p.nome),
  ].join('\n');
  const links = [
    cfg.instagram, cfg.instagram && `instagram.com/${cfg.instagram}`,
    cfg.mapa, cfg.linkAvaliacao,
  ].filter(Boolean).map(l => normalizar(l).replace(/^https?:\/\//, '').replace(/^www\./, ''));
  return { informacoes, catalogo, links, fones: [cfg.whatsapp, cfg.fone].map(soDigitos).filter(Boolean) };
}

/* ── a volta da IA ── */

/**
 * Conversa com a IA até ela responder em texto, executando as ferramentas que
 * pedir. Devolve o texto, o que as ferramentas devolveram (fonte da revisão) e
 * o que foi feito de fato (agendou, cancelou, consultou).
 */
async function conversar(sistema, mensagens, ctx, acumulado) {
  const msgs = [...mensagens];
  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    const r = await responder({ sistema, mensagens: msgs, ferramentas: DEFINICOES });
    acumulado.chamadas++;
    // Recusa do modelo ou resposta cortada: nada disso sai para a cliente.
    if (r.stop_reason === 'refusal' || r.stop_reason === 'max_tokens') return { falhou: r.stop_reason, mensagens: msgs };

    const usos = r.content.filter(b => b.type === 'tool_use');
    if (r.stop_reason !== 'tool_use' || !usos.length) {
      const texto = r.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      if (!texto) return { falhou: 'vazia', mensagens: msgs };
      return { texto, conteudo: r.content, mensagens: msgs };
    }

    // O conteúdo inteiro volta, raciocínio incluído: a API exige o histórico
    // sem edição para o raciocínio continuar valendo.
    msgs.push({ role: 'assistant', content: r.content });
    const resultados = [];
    let passou = null;
    for (const uso of usos) {
      const saida = await executar(uso.name, uso.input, ctx);
      acumulado.ferramentas.push(uso.name);
      if (!saida.erro) {
        if (uso.name === 'agendar') acumulado.acoes.agendou = true;
        if (uso.name === 'cancelar_agendamento') acumulado.acoes.cancelou = true;
        if (uso.name === 'meus_agendamentos') acumulado.acoes.consultou = true;
        if (uso.name === 'passar_para_equipe') passou = true;
      }
      const json = JSON.stringify(saida);
      acumulado.resultados.push(json);
      resultados.push({ type: 'tool_result', tool_use_id: uso.id, content: json, ...(saida.erro ? { is_error: true } : {}) });
    }
    msgs.push({ role: 'user', content: resultados });
    if (passou) return { passou: true, mensagens: msgs };
  }
  return { falhou: 'voltas', mensagens: msgs };
}

/** O histórico gravado, no formato da API. Descartada não conta como dita. */
function historicoParaApi(mensagens) {
  const lista = mensagens
    .filter(m => m.status !== 'descartada')
    .slice(-MAX_HISTORICO)
    .map(m => ({ role: m.autor === 'cliente' ? 'user' : 'assistant', content: m.texto }));
  // A API exige começar pela cliente; o corte do histórico pode cair na IA.
  while (lista.length && lista[0].role !== 'user') lista.shift();
  return lista;
}

/* ── o atendimento ── */

/**
 * Atende uma mensagem da cliente nesta conversa.
 *
 * @param {object} o
 * @param {string} o.conversaId
 * @param {string} o.texto      o que a cliente escreveu
 * @param {boolean} o.simular   true no teste do painel: nada vai para a agenda
 * @returns {Promise<{ resposta: object|null, conversa: object }>}
 */
export async function atender({ conversaId, texto, simular }) {
  const inicio = Date.now();
  const conversa = await db.get('SELECT * FROM conversas WHERE id = ?', conversaId);
  if (!conversa) throw new Error('conversa não encontrada');
  const cfg = await getConfig();
  const status = cfg.atendente?.modo === 'automatico' ? 'enviada' : 'sugerida';
  const log = { evt: 'atendente', conversa: conversa.id, canal: conversa.canal, chamadas: 0, regras: [] };

  await gravar(conversa.id, 'cliente', String(texto).slice(0, 2000));

  // Com a equipe, a IA não fala — nem para "ajudar".
  if (conversa.estado === 'equipe') return terminar({ conversa, resposta: null, log, inicio, acao: 'equipe' });

  const entrada = classificarEntrada(texto);
  log.entrada = entrada.tipo;
  if (VAI_PARA_EQUIPE.has(entrada.tipo)) {
    const resposta = await passarParaEquipe(conversa, CODIGO_DA_ENTRADA[entrada.tipo], status, { entrada: entrada.tipo });
    return terminar({ conversa, resposta, log, inicio, acao: CODIGO_DA_ENTRADA[entrada.tipo] });
  }

  const fontes = await fontesDaClinica(cfg);
  const historico = await mensagensDa(conversa.id);
  const cliente = conversa.fone ? await db.get('SELECT nome FROM clients WHERE fone = ?', conversa.fone) : null;
  const agora = agoraNaClinica();
  const sistema = montarSistema(
    parteFixa(cfg, fontes.informacoes),
    parteDoMomento({ agora, cliente, entrada: entrada.tipo }),
  );
  const ctx = { fone: conversa.fone, simular: Boolean(simular) };
  const acumulado = { chamadas: 0, ferramentas: [], resultados: [], acoes: {} };

  const textoDaCliente = normalizar(historico.filter(m => m.autor === 'cliente').map(m => m.texto).join('\n'));
  const textoDaClinica = normalizar(`${fontes.informacoes}\n${fontes.catalogo}`);
  const ditas = historico.filter(m => m.autor !== 'cliente' && m.status !== 'descartada').map(m => m.texto);

  let mensagens = historicoParaApi(historico);
  let final = null;
  let tentativas = 0;
  const regras = [];
  let usouJuiz = false;

  while (tentativas < 2) {
    tentativas++;
    let volta;
    try {
      volta = await conversar(sistema, mensagens, ctx, acumulado);
    } catch (erro) {
      // Fora do ar, limite de uso, chave errada: a cliente não fica sem
      // resposta — fica com uma pessoa.
      console.error('[atendente] falha na IA:', erro.status || '', erro.message);
      log.falha = 'api';
      break;
    }
    log.chamadas = acumulado.chamadas;
    if (volta.passou) {
      const resposta = await passarParaEquipe(conversa, 'E04', status, { tentativas, regras, ferramentas: acumulado.ferramentas });
      return terminar({ conversa, resposta, log: { ...log, regras }, inicio, acao: 'E04' });
    }
    if (volta.falhou) { log.falha = volta.falhou; break; }

    const fatos = juntarFatos([fontes.informacoes, fontes.catalogo, textoDaCliente, ...ditas,
      `${agora.data} ${agora.amanha} ${agora.hora}`, ...acumulado.resultados]);
    const rev = revisarResposta(volta.texto, {
      fatos, textoDaClinica, textoDaCliente, links: fontes.links,
      fones: [...fontes.fones, conversa.fone].filter(Boolean), acoes: acumulado.acoes,
    });
    let achados = rev.achados;

    if (!achados.length && process.env.ATENDENTE_JUIZ !== 'off'
        && precisaDeJuiz(volta.texto, texto, entrada.tipo)) {
      usouJuiz = true;
      const veredito = await julgar({
        sistema: JUIZ_SISTEMA,
        pedido: pedidoAoJuiz({
          resposta: volta.texto,
          informacoes: `${fontes.informacoes}\n\nResultados do sistema nesta conversa:\n${acumulado.resultados.join('\n')}`,
          ultimaDaCliente: texto,
        }),
        esquema: JUIZ_ESQUEMA,
      }).catch(erro => { console.error('[atendente] juiz:', erro.message); return null; });
      achados = achadosDoJuiz(veredito);
    }

    regras.push(...achados.map(a => a.regra));
    if (!achados.length) { final = volta.texto; break; }

    const gravidade = achados.some(a => a.gravidade === 'critico') ? 'critico' : 'erro';
    if (acaoPara(gravidade) === 'bloquear') break;

    // Nova tentativa SEM editar a anterior: a resposta barrada e a correção
    // entram como voltas novas. Editar o histórico invalidaria o raciocínio
    // que a API guarda, e refazer do zero repetiria o que as ferramentas já
    // fizeram (agendar duas vezes).
    const problemas = achados.map(a => `- ${ROTULOS[a.regra]}${a.trecho ? `: "${a.trecho}"` : ''}`).join('\n');
    mensagens = [
      ...volta.mensagens,
      { role: 'assistant', content: volta.conteudo },
      { role: 'user', content: pedidoDeCorrecao(problemas) },
    ];
  }

  const revisao = { tentativas, regras: [...new Set(regras)], juiz: usouJuiz, ferramentas: acumulado.ferramentas };
  if (final === null) {
    const resposta = await passarParaEquipe(conversa, 'E05', status, revisao);
    return terminar({ conversa, resposta, log: { ...log, regras: revisao.regras }, inicio, acao: 'E05' });
  }
  const resposta = await gravar(conversa.id, 'ia', final, status, revisao);
  return terminar({ conversa, resposta, log: { ...log, regras: revisao.regras, tentativas }, inicio, acao: 'respondeu' });
}

async function terminar({ conversa, resposta, log, inicio, acao }) {
  console.log(JSON.stringify({ ...log, acao, ms: Date.now() - inicio }));
  return { resposta, conversa: await db.get('SELECT * FROM conversas WHERE id = ?', conversa.id) };
}
