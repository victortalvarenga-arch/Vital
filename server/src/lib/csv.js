/**
 * CSV para quem vai abrir no Excel em português, não para outro programa.
 *
 * Três escolhas saem daí, e as três são o que separa "abriu certo" de "virou
 * uma coluna só com ponto e vírgula no meio":
 *
 * - **`;` separa as colunas.** O Excel com região Brasil usa a vírgula como
 *   decimal, e por isso espera `;` como separador. Com `,`, o arquivo abre
 *   inteiro na coluna A.
 * - **O arquivo começa com BOM.** Sem ele, o Excel lê UTF-8 como Latin-1, e o
 *   nome "Conceição" aparece como "ConceiÃ§Ã£o".
 * - **Dinheiro sai com vírgula decimal** (`150,00`), que o Excel daqui entende
 *   como número e soma. Com ponto, vira texto ou, pior, data.
 *
 * E uma de segurança: célula que começa com `=`, `+`, `-` ou `@` é fórmula
 * para o Excel. Nome de cliente vem do site público, sem login — quem se
 * cadastrar como `=HIPERLINK("http://…")` vira um link clicável na planilha da
 * dona. O apóstrofo na frente faz o Excel tratar como texto. Vale só para
 * texto: número negativo de verdade não passa por aqui.
 */

const BOM = '﻿';
const PERIGO = /^[=+\-@\t\r]/;

function celula(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v !== 'number' && PERIGO.test(s)) s = "'" + s;
  // Aspas em volta só quando precisa, e aspas de dentro dobradas — é o que o
  // Excel espera. Quebra de linha dentro de aspas fica na mesma célula.
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * `colunas` é `[[titulo, valorDaLinha], …]`: o cabeçalho e o conteúdo de cada
 * coluna moram juntos, e acrescentar uma não desalinha as outras.
 */
export function paraCsv(colunas, linhas) {
  const saida = [colunas.map(([titulo]) => celula(titulo)).join(';')];
  for (const l of linhas) saida.push(colunas.map(([, valor]) => celula(valor(l))).join(';'));
  // CRLF: é o fim de linha do formato, e o Excel do Windows conta com ele.
  return BOM + saida.join('\r\n') + '\r\n';
}

/** `150.5` → `150,50`. Nulo vira vazio, não zero: "não se sabe" não é "zero". */
export const reais = v => (v === null || v === undefined ? '' : Number(v).toFixed(2).replace('.', ','));

/**
 * `47999990000` → `(47) 99999-0000`.
 *
 * Formatado também porque só dígitos o Excel transforma em número: perde o
 * zero da frente quando há, e acima de 11 dígitos vira notação científica.
 */
export function fone(d) {
  const s = String(d || '').replace(/\D/g, '');
  if (s.length === 11) return `(${s.slice(0, 2)}) ${s.slice(2, 7)}-${s.slice(7)}`;
  if (s.length === 10) return `(${s.slice(0, 2)}) ${s.slice(2, 6)}-${s.slice(6)}`;
  return s;
}
