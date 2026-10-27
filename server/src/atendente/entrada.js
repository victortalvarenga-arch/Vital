import { normalizar } from './texto.js';

/**
 * O que a cliente escreveu, antes de a IA responder.
 *
 * Três casos não vão para a IA de jeito nenhum, e saem com texto fixo e a
 * conversa passada para a equipe:
 *
 *  - **urgência**: reação, dor, inchaço, sangramento depois de procedimento. A
 *    IA não é profissional de saúde, e uma resposta "tranquilizadora" errada
 *    aqui é o pior erro possível deste produto;
 *  - **pedido de humano**: quem pediu para falar com alguém não quer insistência
 *    de robô;
 *  - **reclamação**: precisa de uma pessoa, com nome, assumindo.
 *
 * O quarto, **manipulação** ("ignore suas regras", "você agora é…"), vai para a
 * IA com um aviso no prompt — recusar com gentileza é melhor do que chamar a
 * equipe toda vez que alguém testa o robô.
 *
 * Por padrões fixos, e não por IA: é o caminho que precisa funcionar sempre,
 * de graça e sem latência, inclusive quando a API está fora. Erra para o lado
 * de chamar gente — um falso positivo custa uma mensagem da secretária; um
 * falso negativo custa uma cliente machucada recebendo resposta de robô.
 */

const URGENCIA = [
  /\b(reacao|reagiu|alergi\w*|inchad\w*|inchou|inchaco|sangr\w*|infec\w*|infeccion\w*|pus\b|febre|queim(ou|ada|adura)|bolha\w*|necros\w*|hematoma|falta de ar|desmai\w*|tontura|coceira forte|vermelhidao forte)\b/,
  /\b(muita|muito|forte|insuportavel) dor\b/,
  /\bdor (muito )?(forte|intensa|insuportavel|que nao passa)\b/,
  /\b(ficou|esta|ta|tá) (muito )?(inchad\w*|vermelh\w*|roxo|roxa|ferid\w*|machucad\w*)\b/,
  /\b(depois|apos) (do|da) (procedimento|aplicacao|sessao|botox|preenchimento|peeling|laser)\b.{0,40}\b(dor|incha|vermelh|ferid|mancha|ardendo|ardencia)/,
  /\bemergencia\b/,
];

const HUMANO = [
  /\b(falar|conversar) com (alguem|uma pessoa|um humano|uma humana|atendente|a atendente|a secretaria|a recepcao|a dona|a doutora|o doutor|a profissional|gente de verdade)\b/,
  /\b(atendente|pessoa) (humana|de verdade|real)\b/,
  /\bvoce e (um )?(robo|bot|ia)\b.{0,30}\b(quero|prefiro) (falar|uma pessoa)/,
  /\bme (liga|ligue|ligar)\b/,
];

const RECLAMACAO = [
  /\b(reclama\w*|pessim\w*|horrivel|horroroso|absurdo|descaso|procon|reembolso|devolu\w* (do|o) dinheiro|estorno|insatisfeit\w*|decepcionad\w*)\b/,
  /\bnao gostei (do|da|nada)\b/,
  /\b(ficou|esta) (horrivel|pessimo|errado|torto|manchado)\b/,
  /\b(me|nos) (cobraram|cobrou) (errado|a mais)\b/,
];

const MANIPULACAO = [
  /\b(ignore|ignora|esqueca|esquece|desconsidere|desconsidera) (as |suas |todas as |tudo |o que )?(regras|instrucoes|orientacoes|anteriores|que te disseram)/,
  /\b(system prompt|prompt do sistema|suas instrucoes|seu prompt|modo desenvolvedor|developer mode|jailbreak)\b/,
  /\b(voce agora e|a partir de agora voce e|finja que (e|voce e)|aja como|faca de conta que)\b/,
  /\b(me de|me da|quero) (um )?desconto de \d+/,
];

const algum = (lista, t) => lista.find(re => re.test(t));

/**
 * @returns {{ tipo: 'normal'|'urgencia'|'humano'|'reclamacao'|'manipulacao' }}
 *   A ordem importa: urgência vence tudo — uma reclamação que fala de inchaço
 *   é, antes de tudo, alguém precisando de atendimento.
 */
export function classificarEntrada(texto) {
  const t = normalizar(texto);
  if (algum(URGENCIA, t)) return { tipo: 'urgencia' };
  if (algum(HUMANO, t)) return { tipo: 'humano' };
  if (algum(RECLAMACAO, t)) return { tipo: 'reclamacao' };
  if (algum(MANIPULACAO, t)) return { tipo: 'manipulacao' };
  return { tipo: 'normal' };
}

/** Os tipos que nunca chegam à IA. */
export const VAI_PARA_EQUIPE = new Set(['urgencia', 'humano', 'reclamacao']);
