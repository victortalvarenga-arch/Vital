import { db, uid } from '../db.js';
import { hoje } from './dates.js';

/**
 * Formulários de intake: o que a empresa pergunta antes de atender.
 *
 * O modelo está explicado em `db/migrations/012_formularios.sql`. O resumo: a
 * pergunta é linha, não coluna, porque cada ramo pergunta uma coisa; e a
 * resposta fica presa ao atendimento com o rótulo congelado, porque é histórico
 * clínico, não cadastro.
 */

const TIPOS = ['texto', 'longo', 'numero', 'data', 'sim_nao', 'escolha', 'multipla'];

/** Um formulário com as perguntas, na ordem. */
export async function formCompleto(id) {
  const f = await db.get('SELECT * FROM forms WHERE id = ?', id);
  if (!f) return null;
  const campos = await db.all(
    'SELECT * FROM form_fields WHERE form_id = ? ORDER BY ordem, rotulo', id
  );
  return {
    id: f.id, nome: f.nome, descricao: f.descricao, ativo: !!f.ativo,
    campos: campos.map(c => ({
      id: c.id, rotulo: c.rotulo, ajuda: c.ajuda, tipo: c.tipo,
      obrigatorio: !!c.obrigatorio, opcoes: c.opcoes || [], ordem: c.ordem,
    })),
  };
}

/** Os formulários que um serviço pede. Vazio quando não pede nenhum. */
export async function formsDoServico(servicoId) {
  const linhas = await db.all(
    `SELECT fs.form_id FROM form_services fs JOIN forms f ON f.id = fs.form_id
      WHERE fs.service_id = ? AND f.ativo = 1`,
    servicoId
  );
  const saida = [];
  for (const { form_id: id } of linhas) {
    const f = await formCompleto(id);
    // Formulário sem pergunta nenhuma não vira passo na tela da cliente.
    if (f && f.campos.length) saida.push(f);
  }
  return saida;
}

/**
 * Confere as respostas contra as perguntas de verdade.
 *
 * Nunca confie na lista que chega do site: ela pode trazer pergunta que não
 * existe, pular a obrigatória, ou mandar uma opção que não está na lista. E o
 * rótulo gravado sai daqui, do banco — não do que o cliente enviou —, senão
 * qualquer um escreveria a própria pergunta no prontuário de outra pessoa.
 *
 * @returns {{itens:object[]}|{erro:string}}
 */
export function validarRespostas(form, enviadas) {
  const porId = new Map((enviadas || []).map(r => [r.campoId, r.valor]));
  const itens = [];

  for (const campo of form.campos) {
    const bruto = porId.get(campo.id);
    const vazio = bruto === undefined || bruto === null || bruto === ''
      || (Array.isArray(bruto) && bruto.length === 0);

    if (vazio) {
      if (campo.obrigatorio) return { erro: `responda "${campo.rotulo}"` };
      continue;   // pergunta opcional em branco não vira linha no prontuário
    }

    const valor = normalizar(campo, bruto);
    if (valor.erro) return valor;

    itens.push({ rotulo: campo.rotulo, tipo: campo.tipo, valor: valor.ok });
  }
  return { itens };
}

function normalizar(campo, bruto) {
  switch (campo.tipo) {
    case 'numero': {
      const n = Number(String(bruto).replace(',', '.'));
      if (!Number.isFinite(n)) return { erro: `"${campo.rotulo}" precisa ser um número` };
      return { ok: n };
    }
    case 'data':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(bruto))) {
        return { erro: `"${campo.rotulo}" precisa ser uma data` };
      }
      return { ok: String(bruto) };
    case 'sim_nao':
      return { ok: bruto === true || bruto === 'sim' };
    case 'escolha':
      if (!campo.opcoes.includes(String(bruto))) {
        return { erro: `"${campo.rotulo}": opção inválida` };
      }
      return { ok: String(bruto) };
    case 'multipla': {
      const lista = (Array.isArray(bruto) ? bruto : [bruto]).map(String);
      const fora = lista.filter(v => !campo.opcoes.includes(v));
      if (fora.length) return { erro: `"${campo.rotulo}": opção inválida` };
      return { ok: lista };
    }
    default:
      // Texto vindo da internet: corta no limite em vez de recusar, porque
      // devolver erro por causa de um texto longo perderia o agendamento.
      return { ok: String(bruto).slice(0, campo.tipo === 'longo' ? 2000 : 300) };
  }
}

/** Grava as respostas. Chamado dentro da transação que cria o agendamento. */
export async function gravarRespostas(tx, { formId, agendamentoId, clienteId, itens }) {
  await tx.run(
    `INSERT INTO form_answers (id, form_id, appointment_id, client_id, respostas, criado_em)
     VALUES (?,?,?,?,?,?)`,
    uid(), formId, agendamentoId, clienteId, JSON.stringify(itens), hoje()
  );
}

/** As respostas de um agendamento, para quem vai atender ver antes de começar. */
export async function respostasDoAgendamento(agendamentoId) {
  const linhas = await db.all(
    `SELECT r.id, r.respostas, r.criado_em, f.nome
       FROM form_answers r JOIN forms f ON f.id = r.form_id
      WHERE r.appointment_id = ? ORDER BY r.criado_em`,
    agendamentoId
  );
  return linhas.map(l => ({
    id: l.id, formulario: l.nome, quando: l.criado_em, respostas: l.respostas || [],
  }));
}

/**
 * O que a cliente respondeu da última vez, para o formulário vir preenchido.
 *
 * Ficha de saúde não muda a cada visita, e obrigar a redigitar tudo faz a pessoa
 * responder qualquer coisa para se livrar — que é pior do que não perguntar. Vem
 * como sugestão: o que ela confirmar é o que fica gravado hoje.
 */
export async function ultimaResposta(clienteId, formId) {
  const l = await db.get(
    `SELECT respostas FROM form_answers
      WHERE client_id = ? AND form_id = ? ORDER BY criado_em DESC, id DESC LIMIT 1`,
    clienteId, formId
  );
  return l?.respostas || null;
}

export const TIPOS_DE_CAMPO = TIPOS;
