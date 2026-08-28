import { db } from '../db.js';

/**
 * Serviços adicionais: os extras que podem ser oferecidos junto de um serviço.
 *
 * A oferta vem de dois lugares e é a união dos dois — a empresa pensa tanto
 * "na limpeza de pele, ofereça buço" quanto "em qualquer serviço de Unhas,
 * ofereça esmaltação".
 */

/** Ids dos extras oferecidos para um serviço. */
export async function adicionaisDe(servicoId, categoria) {
  const linhas = await db.all(
    `SELECT addon_id FROM service_addons WHERE service_id = ?
      UNION
     SELECT addon_id FROM category_addons WHERE categoria = ?`,
    servicoId, categoria || ''
  );
  // Um serviço nunca é extra de si mesmo, mesmo que a regra da categoria diga.
  return linhas.map(l => l.addon_id).filter(id => id !== servicoId);
}

/**
 * Valida os extras escolhidos e devolve o que somar ao agendamento.
 *
 * Nunca confie na lista que chega do site: alguém pode mandar qualquer id e
 * levar um serviço caro pelo preço de um extra, ou marcar um extra que aquele
 * serviço não oferece. Aqui a lista é conferida contra a oferta real e os
 * preços vêm do banco, nunca do cliente.
 */
export async function validarAdicionais(servico, idsPedidos) {
  const ids = [...new Set((idsPedidos || []).filter(Boolean))];
  if (!ids.length) return { itens: [], preco: 0, duracao: 0 };

  const permitidos = new Set(await adicionaisDe(servico.id, servico.categoria));
  const invalidos = ids.filter(id => !permitidos.has(id));
  if (invalidos.length) {
    return { erro: 'adicional não disponível para este serviço', codigo: 400 };
  }

  const itens = await db.all(
    `SELECT id, nome, preco, duracao, intervalo FROM services
      WHERE id IN (${ids.map(() => '?').join(',')}) AND ativo = 1`,
    ...ids
  );
  if (itens.length !== ids.length) {
    return { erro: 'adicional indisponível', codigo: 409 };
  }

  return {
    itens: itens.map(i => ({
      id: i.id, nome: i.nome, preco: i.preco,
      // O intervalo de limpeza do extra também ocupa a cadeira.
      duracao: i.duracao + (i.intervalo || 0),
    })),
    preco: itens.reduce((n, i) => n + Number(i.preco), 0),
    duracao: itens.reduce((n, i) => n + i.duracao + (i.intervalo || 0), 0),
  };
}

/** Grava os extras de um agendamento. Chamado dentro da transação que o cria. */
export async function gravarAdicionais(tx, agendamentoId, itens) {
  for (const i of itens) {
    await tx.run(
      `INSERT INTO appointment_addons (appointment_id, service_id, nome, preco, duracao)
       VALUES (?,?,?,?,?)`,
      agendamentoId, i.id, i.nome, i.preco, i.duracao
    );
  }
}

/** Extras de um agendamento, para mostrar no painel e na confirmação. */
export async function adicionaisDoAgendamento(agendamentoId) {
  const linhas = await db.all(
    'SELECT service_id, nome, preco, duracao FROM appointment_addons WHERE appointment_id = ? ORDER BY nome',
    agendamentoId
  );
  return linhas.map(l => ({ id: l.service_id, nome: l.nome, preco: l.preco, duracao: l.duracao }));
}
