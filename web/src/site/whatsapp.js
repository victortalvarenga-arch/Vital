/**
 * Links de WhatsApp do site, com a mensagem já escrita.
 *
 * Quem tem dúvida no meio do catálogo precisa perguntar dali, não rolar até o
 * rodapé — e chegar do outro lado com "Oi" obriga a empresa a descobrir do que
 * a pessoa fala. A mensagem cita o serviço que estava na tela.
 *
 * O texto é do produto, não de um ramo: nomeia o serviço e faz uma pergunta
 * aberta. Nada de "sua pele" nem "seu cabelo" — quem escreve assunto de ramo é
 * a empresa, na config.
 */

/** wa.me só aceita dígitos. Sem número, não há link — quem chama devolve nulo. */
const base = (whatsapp, texto) => {
  const numero = String(whatsapp || '').replace(/\D/g, '');
  if (!numero) return null;
  return `https://wa.me/55${numero}?text=${encodeURIComponent(texto)}`;
};

/**
 * "Falar sobre este serviço" — o link de cada cartão da vitrine.
 *
 * Sem o nome do negócio na frase, de propósito: ele exigiria adivinhar artigo
 * ("d**o** Studio", "d**a** Barbearia") e erraria em metade das empresas. Do
 * outro lado da conversa, quem recebe já sabe qual é o próprio número.
 */
export const linkServico = (negocio, servico) =>
  base(negocio?.whatsapp, `Olá! Vim pelo site e queria tirar uma dúvida sobre ${servico.nome}.`);

/** O link solto: barra do topo, rodapé, botão flutuante, agenda sem horário. */
export const linkGeral = (negocio, assunto) =>
  base(negocio?.whatsapp, assunto || 'Olá! Vim pelo site e queria tirar uma dúvida.');
