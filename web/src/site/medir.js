import { evento } from '../shared/publico.js';

/**
 * Os passos que a visita dá até marcar horário.
 *
 * Existe para responder uma pergunta que ninguém sabia responder: **em qual
 * tela as pessoas somem.** Sem isso, toda conversa sobre o agendamento é
 * palpite — dá para reformar o calendário por um mês e descobrir depois que a
 * desistência estava no passo do WhatsApp.
 *
 * O que NÃO é: rastreamento. A sessão é um número sorteado aqui, guardado em
 * `sessionStorage` (morre ao fechar a aba) e nunca ligado a nome, telefone ou
 * cliente nenhum. Não há cookie, não há terceiro, nada sai para fora do
 * servidor da própria empresa. É contagem de percurso, e é por isso que não
 * precisa de banner de consentimento.
 *
 * Falhar aqui não pode custar um agendamento: toda chamada é disparada sem
 * espera e engole o próprio erro.
 */

const CHAVE = 'vital_sessao';

/**
 * O id desta visita. Sorteado uma vez e reaproveitado enquanto a aba viver —
 * é o que faz "abriu o site" e "confirmou" serem a MESMA pessoa na conta.
 *
 * `sessionStorage` falha em aba anônima de alguns navegadores e dentro de
 * webview com dado de site bloqueado. Quando falha, a visita ainda é medida:
 * o id fica só em memória e vale enquanto a página estiver aberta, que é o
 * suficiente para o funil de uma sessão.
 */
let emMemoria = null;

function sessao() {
  if (emMemoria) return emMemoria;
  try {
    const guardado = sessionStorage.getItem(CHAVE);
    if (guardado) return (emMemoria = guardado);
  } catch { /* storage bloqueado: segue em memória */ }

  // 32 hexadecimais, a mesma forma que o servidor exige — ver `lib/funil.js`.
  const novo = [...crypto.getRandomValues(new Uint8Array(16))]
    .map(b => b.toString(16).padStart(2, '0')).join('');
  try { sessionStorage.setItem(CHAVE, novo); } catch { /* idem */ }
  return (emMemoria = novo);
}

/** O id desta visita, para o agendamento mandar junto ao confirmar. */
export const idDaSessao = () => sessao();

/**
 * Marca um passo. Não espera resposta e nunca lança.
 *
 * Repetir é de graça: o servidor guarda um passo por sessão (chave primária),
 * então quem abrir a janela cinco vezes continua valendo uma visita.
 */
export function passo(etapa) {
  try {
    evento({ sessao: sessao(), etapa }).catch(() => {});
  } catch { /* medição nunca atrapalha quem está agendando */ }
}
