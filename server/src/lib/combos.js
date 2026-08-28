import { db } from '../db.js';
import { hoje } from './dates.js';

/**
 * Combos: pacote de serviços com preço fechado, mais barato que a soma.
 *
 * O modelo de dados está explicado em `db/migrations/006_combos.sql`. O resumo:
 * cada serviço do combo vira um agendamento normal, e os irmãos ficam ligados
 * por `combo_grupo`.
 */

/** Dinheiro em centavos: o resto do arquivo faz conta inteira. */
const centavos = v => Math.round(Number(v) * 100);

/**
 * Divide o preço do combo entre os serviços, proporcionalmente ao preço de
 * tabela de cada um.
 *
 * **A regra do negócio, em uma frase:** o desconto do combo é dividido entre as
 * profissionais envolvidas na proporção do que cada serviço vale avulso. Quem
 * leva o serviço mais caro absorve a maior parte do desconto; com uma pessoa só
 * no combo, ela absorve tudo — e isso não é um caso à parte, é a mesma conta
 * com um item só.
 *
 * Exemplo: Limpeza R$ 150 (Ana) + Sobrancelha R$ 75 (Bia) = R$ 225 avulso.
 * Combo por R$ 200, desconto de R$ 25. Ana fica com 150/225 do desconto
 * (R$ 16,67) e recebe R$ 133,33; Bia com 75/225 (R$ 8,33) e recebe R$ 66,67.
 *
 * **Os centavos da divisão têm dono.** Rateio de dinheiro quase nunca fecha
 * redondo, e "cada um arredonda o seu" faz a soma das partes não bater com o
 * que a cliente pagou — o caixa fecha com dois centavos sobrando e ninguém
 * descobre por quê. Aqui a conta é feita em centavos inteiros e o que sobra vai
 * para quem perdeu a maior fração no arredondamento; empate desempata pelo
 * serviço mais caro. A soma das partes é sempre exatamente o preço do combo, e
 * há teste que confere isso item a item.
 *
 * @param {{preco:number}[]} itens  serviços do combo, com o preço de tabela
 * @param {number} precoCombo       o preço fechado do pacote
 * @returns {object[]} os mesmos itens, cada um com `valor` (a parte dele)
 */
export function ratearCombo(itens, precoCombo) {
  if (!itens.length) return [];

  const precos = itens.map(i => centavos(i.preco));
  const cheio = precos.reduce((a, b) => a + b, 0);
  const alvo = centavos(precoCombo);

  // Serviço de graça no pacote inteiro não tem proporção para respeitar; aí a
  // divisão é igual, que é o único critério que sobra.
  const base = cheio > 0 ? precos : precos.map(() => 1);
  const total = cheio > 0 ? cheio : precos.length;

  const exato = base.map(p => (p * alvo) / total);
  const parte = exato.map(Math.floor);
  const sobra = alvo - parte.reduce((a, b) => a + b, 0);

  const perdeuMais = exato
    .map((e, i) => ({ i, resto: e - Math.floor(e), preco: precos[i] }))
    .sort((a, b) => b.resto - a.resto || b.preco - a.preco || a.i - b.i);

  for (let k = 0; k < sobra; k++) parte[perdeuMais[k].i]++;

  return itens.map((item, i) => ({ ...item, valor: parte[i] / 100 }));
}

/** Quanto a cliente economiza comprando o pacote. */
export const economiaDe = (servicos, preco) =>
  Math.max(0, servicos.reduce((n, s) => n + Number(s.preco), 0) - Number(preco));

/**
 * Um combo com os serviços dentro, na ordem do atendimento.
 *
 * `precoCheio` e `economia` vêm calculados: a empresa não deve ter de fazer
 * essa conta na mão, e é ela que vira o argumento de venda na tela.
 */
export async function comboCompleto(id) {
  const c = await db.get('SELECT * FROM combos WHERE id = ?', id);
  if (!c) return null;

  const servicos = await db.all(
    `SELECT s.id, s.nome, s.preco, s.duracao, s.intervalo, s.categoria, s.foto, cs.ordem
       FROM combo_services cs JOIN services s ON s.id = cs.service_id
      WHERE cs.combo_id = ? ORDER BY cs.ordem, s.nome`,
    id
  );

  const precoCheio = servicos.reduce((n, s) => n + Number(s.preco), 0);
  return {
    id: c.id, nome: c.nome, descricao: c.descricao, preco: Number(c.preco),
    foto: c.foto, validoAte: c.valido_ate, ativo: !!c.ativo, ordem: c.ordem,
    servicos: servicos.map(s => ({
      id: s.id, nome: s.nome, preco: Number(s.preco),
      duracao: s.duracao, intervalo: s.intervalo || 0,
      categoria: s.categoria, foto: s.foto,
    })),
    precoCheio,
    economia: Math.max(0, precoCheio - Number(c.preco)),
    // A cadeira fica ocupada pelo combo inteiro, limpeza de cada serviço junto.
    duracao: servicos.reduce((n, s) => n + s.duracao + (s.intervalo || 0), 0),
    vencido: vencido(c.valido_ate),
  };
}

/** Promoção de Natal não pode continuar no ar em março. */
export const vencido = validoAte => Boolean(validoAte) && validoAte < hoje();

/**
 * Combos que a empresa está oferecendo agora.
 *
 * O vencimento é conferido aqui, e não por um job que desativa a linha: assim
 * a promoção some do site sozinha no dia certo, sem depender de nada ter
 * rodado, e volta se a empresa esticar o prazo.
 */
export async function combosAtivos({ incluirVencidos = false } = {}) {
  const linhas = await db.all(
    `SELECT id FROM combos WHERE ativo = 1 ORDER BY ordem, nome`
  );
  const lista = [];
  for (const { id } of linhas) {
    const c = await comboCompleto(id);
    // Combo sem serviço nenhum é cadastro pela metade: não vai para a vitrine.
    if (c && c.servicos.length && (incluirVencidos || !c.vencido)) lista.push(c);
  }
  return lista;
}

/**
 * Quem pode executar o combo inteiro sozinha.
 *
 * Hoje o site vende o combo com uma profissional só, do começo ao fim: é o caso
 * comum do balcão e mantém a reserva de horário sendo uma pergunta só ("cabem
 * 90 minutos seguidos na agenda dela?"). O rateio já sabe lidar com mais de uma
 * pessoa, e o banco também — falta a tela que deixa escolher por serviço.
 */
export async function profissionaisDoCombo(comboId) {
  const servicos = await db.all(
    'SELECT service_id FROM combo_services WHERE combo_id = ?', comboId
  );
  if (!servicos.length) return [];

  const ids = servicos.map(s => s.service_id);
  const vinculos = await db.all(
    `SELECT staff_id, COUNT(DISTINCT service_id) n
       FROM service_staff WHERE service_id = ANY(?)
      GROUP BY staff_id HAVING COUNT(DISTINCT service_id) = ?`,
    ids, ids.length
  );
  return vinculos.map(v => v.staff_id);
}
