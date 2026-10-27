import { db, uid, listarServicos, getConfig } from '../db.js';
import { hoje, agora, addDias, diaSemana, DIAS } from '../lib/dates.js';
import { horariosLivres, horariosPorServico, diasComVaga, foraDoPrazoDoSite } from '../lib/availability.js';
import { adicionaisDeTodos } from '../lib/adicionais.js';
import { criarAgendamento, cancelarPelaCliente } from '../routes/agendamentos.js';
import { registrarDoSistema } from '../lib/registro.js';

/**
 * As ferramentas do atendente: o único jeito de a IA saber preço, serviço,
 * equipe, horário livre e agendamento. Ela não recebe catálogo no prompt — pede
 * aqui, e o que volta é o que a revisão (`saida.js`) aceita como fonte.
 *
 * Três regras valem para todas:
 *
 *  - **rodam no contexto da empresa** (requisição ou `db.comEmpresa`) e nunca
 *    recebem empresa como argumento. O RLS é quem garante que a IA não enxerga
 *    outra clínica — não o prompt;
 *  - **a cliente é o número que está escrevendo**, nunca um argumento da IA.
 *    Quem consulta, agenda e cancela é sempre "este número", e o cancelamento
 *    confere que o agendamento é dele;
 *  - **toda entrada é conferida aqui**: a IA pode mandar qualquer coisa, e a
 *    resposta de erro volta para ela como resultado, em português, para ela
 *    contornar ou passar para a equipe.
 *
 * As que escrevem passam pelas mesmas funções do site (`criarAgendamento`,
 * origem 'whatsapp'): mesmas conferências de serviço ativo, quem faz o quê,
 * prazo, jornada e conflito. Duas implementações da mesma regra divergem.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MES = /^\d{4}-\d{2}$/;
const HORA = /^\d{2}:\d{2}$/;
const texto = v => (typeof v === 'string' ? v.trim() : '');

const objeto = (properties, required = []) => ({
  type: 'object', properties, required, additionalProperties: false,
});

export const DEFINICOES = [
  {
    name: 'ver_servicos',
    description: 'Lista os serviços que a clínica oferece, com id, duração em minutos, preço (ou null quando a clínica prefere informar pessoalmente) e os adicionais de cada um. Use antes de falar de qualquer serviço ou preço.',
    input_schema: objeto({}),
  },
  {
    name: 'ver_horarios',
    description: 'Horários livres de um serviço num dia, por profissional. profissional_id vazio traz todas que fazem o serviço. Use antes de oferecer qualquer horário.',
    input_schema: objeto({
      servico_id: { type: 'string' },
      data: { type: 'string', description: 'YYYY-MM-DD' },
      profissional_id: { type: 'string', description: 'vazio para qualquer profissional' },
    }, ['servico_id', 'data', 'profissional_id']),
  },
  {
    name: 'ver_dias_livres',
    description: 'Quais dias de um mês ainda têm algum horário livre para um serviço. Use quando a cliente não tem dia definido.',
    input_schema: objeto({
      servico_id: { type: 'string' },
      mes: { type: 'string', description: 'YYYY-MM' },
      profissional_id: { type: 'string', description: 'vazio para qualquer profissional' },
    }, ['servico_id', 'mes', 'profissional_id']),
  },
  {
    name: 'agendar',
    description: 'Agenda um horário para a cliente deste número. Só chame depois que ela confirmar serviço, profissional, dia e horário. Para quem ainda não é cliente, nome completo e data de nascimento são obrigatórios; para quem já é, mande os dois vazios.',
    input_schema: objeto({
      servico_id: { type: 'string' },
      profissional_id: { type: 'string' },
      data: { type: 'string', description: 'YYYY-MM-DD' },
      hora: { type: 'string', description: 'HH:MM, exatamente como veio de ver_horarios' },
      nome: { type: 'string', description: 'nome completo, só para quem ainda não é cliente' },
      nascimento: { type: 'string', description: 'YYYY-MM-DD, só para quem ainda não é cliente' },
    }, ['servico_id', 'profissional_id', 'data', 'hora', 'nome', 'nascimento']),
  },
  {
    name: 'meus_agendamentos',
    description: 'Os próximos agendamentos da cliente deste número, com id, serviço, profissional, data e hora.',
    input_schema: objeto({}),
  },
  {
    name: 'cancelar_agendamento',
    description: 'Cancela um agendamento da cliente deste número. Só chame depois que ela confirmar qual. Para remarcar: agende o novo horário primeiro e só depois cancele o antigo.',
    input_schema: objeto({ agendamento_id: { type: 'string' } }, ['agendamento_id']),
  },
  {
    name: 'passar_para_equipe',
    description: 'Passa a conversa para uma pessoa da equipe. Use quando não souber responder, quando a dúvida for de saúde, quando a cliente pedir uma pessoa ou reclamar.',
    input_schema: objeto({ motivo: { type: 'string' } }, ['motivo']),
  },
];

/** Nomes das pessoas, para a resposta nunca precisar de id. */
async function nomesDaEquipe() {
  const linhas = await db.all('SELECT id, nome FROM staff WHERE ativo = 1');
  return new Map(linhas.map(l => [l.id, l.nome]));
}

async function clienteDoNumero(fone) {
  return fone ? db.get('SELECT * FROM clients WHERE fone = ?', fone) : null;
}

const diaPorExtenso = data => `${DIAS[diaSemana(data)]} ${data.slice(8)}/${data.slice(5, 7)}`;

const EXECUTORES = {
  async ver_servicos() {
    const cfg = await getConfig();
    const servicos = (await listarServicos({ somenteAtivos: true }));
    const extras = await adicionaisDeTodos(servicos);
    const porId = new Map(servicos.map(s => [s.id, s]));
    // O preço segue a mesma chave do site: escondido lá, escondido aqui.
    const preco = s => (cfg.exibir?.preco && s.mostrarPreco ? Number(s.preco) : null);
    return {
      servicos: servicos.filter(s => !s.somenteAdicional).map(s => ({
        id: s.id, nome: s.nome, categoria: s.categoria || '',
        descricao: String(s.descricao || '').slice(0, 300),
        duracao_min: s.duracao, preco: preco(s),
        adicionais: (extras.get(s.id) || []).map(id => porId.get(id)).filter(Boolean)
          .map(a => ({ id: a.id, nome: a.nome, duracao_min: a.duracao, preco: preco(a) })),
      })),
    };
  },

  async ver_horarios(e) {
    const servicoId = texto(e.servico_id);
    const data = texto(e.data);
    if (!ISO.test(data)) return { erro: 'data precisa ser YYYY-MM-DD' };
    const svc = await db.get('SELECT * FROM services WHERE id = ? AND ativo = 1', servicoId);
    if (!svc) return { erro: 'serviço não encontrado; use ver_servicos' };
    const prazo = await foraDoPrazoDoSite(data);
    if (prazo) return { data, erro: prazo };

    const nomes = await nomesDaEquipe();
    const profissionalId = texto(e.profissional_id);
    const lista = profissionalId
      ? [{ profissionalId, horarios: await horariosLivres({ staffId: profissionalId, data, duracao: svc.duracao + (svc.intervalo || 0) }) }]
      : await horariosPorServico({ servicoId, data });
    return {
      data, dia: diaPorExtenso(data),
      por_profissional: lista.filter(p => nomes.has(p.profissionalId) && p.horarios.length).map(p => ({
        profissional_id: p.profissionalId, profissional: nomes.get(p.profissionalId),
        // Um dia inteiro de grade de 30 min passa de vinte horários; para
        // conversa de WhatsApp, os primeiros bastam — a cliente pede outro.
        horarios: p.horarios.slice(0, 12),
      })),
    };
  },

  async ver_dias_livres(e) {
    const mes = texto(e.mes);
    if (!MES.test(mes)) return { erro: 'mes precisa ser YYYY-MM' };
    const servicoId = texto(e.servico_id);
    if (!(await db.get('SELECT 1 FROM services WHERE id = ? AND ativo = 1', servicoId))) {
      return { erro: 'serviço não encontrado; use ver_servicos' };
    }
    const dias = await diasComVaga({ servicoId, profissionalId: texto(e.profissional_id) || undefined, mes });
    return { mes, dias: dias.map(d => ({ data: d, dia: diaPorExtenso(d) })) };
  },

  async agendar(e, ctx) {
    let cliente = await clienteDoNumero(ctx.fone);
    if (!cliente) {
      const nome = texto(e.nome);
      const nascimento = texto(e.nascimento);
      if (nome.length < 3 || !nome.includes(' ')) return { erro: 'primeiro agendamento: peça o nome completo' };
      if (!ISO.test(nascimento) || nascimento > hoje()) return { erro: 'primeiro agendamento: peça a data de nascimento' };
      if (ctx.simular) {
        cliente = { id: null, nome };
      } else {
        const id = uid();
        // Quem escreve no WhatsApp da clínica aceitou conversar por ali; a
        // promoção continua dependendo do `optin`, que nasce ligado como no
        // site e a cliente desliga respondendo "PARAR" (Bloco 12).
        await db.run(
          `INSERT INTO clients (id,nome,fone,nascimento,endereco,obs,optin,criado_em) VALUES (?,?,?,?,?,?,?,?)`,
          id, nome, ctx.fone, nascimento, '', '', 1, hoje()
        );
        cliente = await db.get('SELECT * FROM clients WHERE id = ?', id);
      }
    }
    if (!HORA.test(texto(e.hora))) return { erro: 'hora precisa ser HH:MM' };

    const dados = {
      clienteId: cliente.id, servicoId: texto(e.servico_id), profissionalId: texto(e.profissional_id),
      data: texto(e.data), hora: texto(e.hora), obs: 'agendado pelo WhatsApp',
      pagamento: { status: 'aberto', forma: 'local' },
    };
    const r = await criarAgendamento(dados, { origem: 'whatsapp', simular: ctx.simular });
    if (r.erro) return { erro: r.erro };
    if (r.simulado) return { agendado: true, simulacao: true, ...r.simulado, dia: diaPorExtenso(r.simulado.data) };

    const a = r.agendamento;
    const nomes = await nomesDaEquipe();
    const svc = await db.get('SELECT nome FROM services WHERE id = ?', a.servicoId);
    await registrarDoSistema('agendamento.criado', {
      alvoId: a.id,
      resumo: `atendente do WhatsApp agendou ${cliente.nome.split(' ')[0]} em ${a.data} às ${a.hora}`,
      detalhe: { origem: 'whatsapp' },
    });
    return {
      agendado: true, agendamento_id: a.id, servico: svc?.nome, profissional: nomes.get(a.profissionalId),
      data: a.data, dia: diaPorExtenso(a.data), hora: a.hora, duracao_min: a.duracao, valor: Number(a.valor),
    };
  },

  async meus_agendamentos(_e, ctx) {
    const cliente = await clienteDoNumero(ctx.fone);
    if (!cliente) return { agendamentos: [], cliente_cadastrada: false };
    const linhas = await db.all(
      `SELECT a.id, a.data, a.hora, a.status, s.nome AS servico, p.nome AS profissional
         FROM appointments a
         JOIN services s ON s.id = a.service_id
         JOIN staff p ON p.id = a.staff_id
        WHERE a.client_id = ? AND a.status IN ('agendado','confirmado')
          AND (a.data > ? OR (a.data = ? AND a.hora > ?))
        ORDER BY a.data, a.hora LIMIT 10`,
      cliente.id, hoje(), hoje(), agora()
    );
    return { agendamentos: linhas.map(l => ({ agendamento_id: l.id, servico: l.servico, profissional: l.profissional,
      data: l.data, dia: diaPorExtenso(l.data), hora: l.hora, status: l.status })) };
  },

  async cancelar_agendamento(e, ctx) {
    const cliente = await clienteDoNumero(ctx.fone);
    if (!cliente) return { erro: 'este número não tem agendamentos' };
    const r = await cancelarPelaCliente(texto(e.agendamento_id), cliente.id, { simular: ctx.simular });
    if (r.erro) return { erro: r.erro };
    if (!r.simulado) {
      await registrarDoSistema('agendamento.cancelado', {
        alvoId: r.cancelado.id,
        resumo: `atendente do WhatsApp cancelou o horário de ${cliente.nome.split(' ')[0]} · ${r.cancelado.data} ${r.cancelado.hora}`,
        detalhe: { origem: 'whatsapp' },
      });
    }
    return { cancelado: true, simulacao: Boolean(r.simulado), data: r.cancelado.data, hora: r.cancelado.hora };
  },

  async passar_para_equipe(e) {
    return { passado: true, motivo: texto(e.motivo).slice(0, 200) };
  },
};

/**
 * Executa uma ferramenta pedida pela IA.
 * @param {{ fone: string, simular: boolean }} ctx — o número de quem escreve
 * @returns {Promise<object>} sempre um objeto; erro volta como `{ erro }`
 */
export async function executar(nome, entrada, ctx) {
  const fn = EXECUTORES[nome];
  if (!fn) return { erro: `ferramenta desconhecida: ${nome}` };
  // `opcional`: dentro de uma requisição, um erro de banco aqui envenenaria a
  // transação e a conversa morreria adiante, longe da causa.
  try {
    return await db.opcional(() => fn(entrada && typeof entrada === 'object' ? entrada : {}, ctx));
  } catch (erro) {
    console.error('[atendente] ferramenta', nome, erro.message);
    return { erro: 'não consegui consultar agora' };
  }
}

/** O que a IA precisa saber de hoje, sem ferramenta: data e hora da clínica. */
export function agoraNaClinica() {
  const h = hoje();
  return { data: h, dia: diaPorExtenso(h), hora: agora(), amanha: addDias(h, 1) };
}
