/**
 * O que este aparelho lembra da cliente: o WhatsApp dela, e nada mais.
 *
 * A segunda vez que ela agenda, não há o que digitar — o número já está aqui,
 * encoberto, com um "Trocar" ao lado. É o ganho que o login do Google traria,
 * sem conta, sem senha e sem pedir nada a ninguém.
 *
 * **Não é login, e o servidor não acredita nisto.** O que fica guardado é o
 * número que a própria pessoa digitou, no navegador dela; quem decide quem ela
 * é continua sendo o `/identificar`, que responde sim ou não para qualquer
 * número. Guardar aqui só evita digitar de novo.
 *
 * **Não é a sessão do funil.** `medir.js` sorteia um id em `sessionStorage`,
 * que morre ao fechar a aba e nunca é ligado a pessoa nenhuma — é contagem de
 * percurso, e é por isso que não precisa de banner. Misturar as duas coisas
 * transformaria a medição em rastreamento de gente. Chave diferente, depósito
 * diferente, arquivo diferente.
 *
 * **Uma empresa não lê o que a cliente digitou na outra.** Cada empresa tem
 * seu endereço (`laurafaust.vital.com.br`), e `localStorage` é por origem —
 * o isolamento aqui é do navegador, como no banco é do Postgres.
 *
 * Tudo em `try/catch`: em aba anônima, com dados de site bloqueados ou dentro
 * do webview do Instagram, ler ou gravar levanta exceção. Falhar aqui não pode
 * custar um agendamento — sem memória, a tela é a de sempre, com o campo
 * vazio.
 */

const CHAVE = 'vital_fone';

/** O número que esta pessoa usou da última vez, ou `''`. */
export function foneLembrado() {
  try {
    const d = (localStorage.getItem(CHAVE) || '').replace(/\D/g, '');
    // Guardado por uma versão antiga, ou editado à mão: trata como ausente.
    return d.length === 11 ? d : '';
  } catch {
    return '';
  }
}

/** Chamado depois que o agendamento deu certo — nunca antes. */
export function lembrarFone(digitos) {
  try { localStorage.setItem(CHAVE, String(digitos || '')); } catch { /* sem memória, sem problema */ }
}

/** O "Trocar": o aparelho esquece, e a tela volta ao campo vazio. */
export function esquecerFone() {
  try { localStorage.removeItem(CHAVE); } catch { /* idem */ }
}

/**
 * `(47) ••••-7766`.
 *
 * O DDD e os quatro últimos bastam para ela reconhecer o próprio número, e não
 * entregam o número inteiro a quem pegou o celular emprestado — que é
 * exatamente quem precisa ver o "Trocar" e tocar nele.
 */
export const foneEncoberto = digitos => {
  const d = String(digitos || '');
  return d.length === 11 ? `(${d.slice(0, 2)}) ••••-${d.slice(-4)}` : '';
};
