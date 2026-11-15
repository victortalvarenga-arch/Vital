/**
 * O telefone da cliente: é identidade e é canal, nessa ordem.
 *
 * `clients.fone` é a chave única da ficha — é por ele que o site sabe se a
 * pessoa já é cliente — e é por ele que sai tudo o que a Vital promete depois
 * do agendamento: confirmação, lembrete de véspera, aviso no dia,
 * pós-atendimento, aniversário. Número impossível não é campo mal preenchido:
 * é ficha duplicada na busca de quem atende e uma fila inteira de mensagens
 * que falha calada (no modo manual, um `wa.me` que não abre).
 *
 * **Duas regras, de propósito** (decidido em 2026-11-13, ROADMAP Bloco 4c):
 *
 * - `foneValido` — o site. Exige celular: é por ele que a cliente se
 *   identifica sozinha e é para ele que a mensagem vai. Fixo aqui seria
 *   cadastro que nunca recebe nada, feito por quem não tem a quem recorrer.
 * - `telefoneValido` — o painel. Aceita também o fixo, porque cliente que só
 *   tem fixo existe (a de mais idade, que marca por telefone), e recusar o
 *   cadastro dela é recusar uma cliente de verdade. Quem está do outro lado é
 *   a recepção, que sabe o que está fazendo e pode corrigir depois.
 *
 * As duas recusam o impossível, que é lixo em qualquer tela. O preço da
 * diferença está escrito em `test/cliente-fone.test.js`: a ficha com fixo
 * existe, e a cliente dela não se identifica no site — quem agenda por ela é a
 * recepção.
 *
 * **Só Brasil.** `foneE164` (`lib/dates.js`) prega `55` na frente de tudo, e o
 * número é guardado sem o `+55`. Número de outro país viraria `55` + ele, e a
 * mensagem iria para o nada — então a recusa aqui não é restrição nova, é a
 * arquitetura inteira dizendo a mesma coisa num lugar visível.
 *
 * Telefone de unidade (`units.fone`) não passa por aqui: é o número que a
 * recepção atende, e fixo ali é o normal.
 */

/**
 * Os 67 DDDs que existem no Brasil.
 *
 * Lista fechada, e não "de 11 a 99": `30`, `50` e `80` não são DDD, e um deles
 * digitado sem querer passaria direito a uma faixa.
 */
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
].map(String));

const CELULAR = 'Digite o celular com DDD: 11 números, como (47) 99999-9999.';
const TELEFONE = 'Digite o telefone com DDD: 10 números (fixo) ou 11 (celular).';
const DDD_RUIM = 'Esse DDD não existe. Confira os dois primeiros números.';
const SEM_NOVE = 'Celular tem 9 logo depois do DDD. Confira o número.';
const FALSO = 'Esse número não parece um telefone de verdade.';

/** Celular brasileiro completo — o único que recebe WhatsApp. */
export const recebeWhatsapp = digitos =>
  /^\d{11}$/.test(String(digitos ?? '')) && String(digitos)[2] === '9';

/**
 * O que não serve em tela nenhuma. `null` quando passa, a mensagem quando não.
 */
function impossivel(n) {
  if (!DDDS.has(n.slice(0, 2))) return DDD_RUIM;
  // Os oito dígitos do assinante — os últimos oito, depois do DDD e do 9 do
  // celular — todos iguais: `11999999999`, `4733333333`. Ninguém digita isso
  // por engano, e é o que um robô preenche.
  if (new Set(n.slice(-8)).size === 1) return FALSO;
  return null;
}

/**
 * O telefone da cliente **no site**. Espera só dígitos — a máscara da tela sai
 * antes, em `soDigitos`.
 *
 * Devolve texto, e não `false`, porque o campo precisa dizer O QUE está
 * errado: "inválido" deixa a pessoa conferindo o número inteiro sem saber se o
 * problema é o DDD ou o 9 da frente.
 *
 * @param {string} digitos telefone só com números, com DDD e sem o +55
 * @returns {string|null}
 */
export function foneValido(digitos) {
  const n = String(digitos ?? '');
  // Fixo (10 dígitos) cai aqui, e é de propósito: a mensagem fala em celular
  // porque é isso que falta, não um dígito.
  if (!/^\d{11}$/.test(n)) return CELULAR;
  if (n[2] !== '9') return SEM_NOVE;
  return impossivel(n);
}

/**
 * O telefone da ficha **no painel**: celular ou fixo, desde que exista.
 *
 * @param {string} digitos telefone só com números, com DDD e sem o +55
 * @returns {string|null}
 */
export function telefoneValido(digitos) {
  const n = String(digitos ?? '');
  if (!/^\d{10,11}$/.test(n)) return TELEFONE;
  // Com 11 dígitos é celular, e celular tem o 9. Sem ele, o que chegou foi um
  // fixo com um dígito a mais — erro de digitação, não número de outro tipo.
  if (n.length === 11 && n[2] !== '9') return SEM_NOVE;
  return impossivel(n);
}
