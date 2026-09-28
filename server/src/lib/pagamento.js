// Quanto entrou de um atendimento: o valor manda, o status é consequência.

/**
 * O pagamento de um atendimento, a partir do que veio no corpo.
 *
 * O dado é `pag_recebido`; `pag_status` é derivado dele, aqui e em lugar
 * nenhum mais. Quem escrevesse os dois teria dois lugares para divergir, e a
 * divergência apareceria só no fim do mês, quando o caixa não bate.
 *
 * Três formas de pedir, porque são três intenções diferentes:
 *
 *   `{ recebido: 20 }`     recebi 20 — entrada, ou o resto de uma entrada
 *   `{ status: 'pago' }`   recebi tudo (é o que o combo e o gateway dizem)
 *   `{ status: 'aberto' }` desfaz: não entrou nada
 *
 * `recebido` é absoluto e não incremento: repetir a mesma chamada — clique
 * duplo, retry de rede — não pode cobrar duas vezes.
 */
export function pagamentoDe(atual, pagamento, valor) {
  const cheio = centavos(valor);
  const antes = centavos(atual?.pag_recebido || 0);

  let recebido;
  if (pagamento?.recebido != null) recebido = centavos(pagamento.recebido);
  else if (pagamento?.status === 'pago') recebido = cheio;
  else if (pagamento?.status === 'aberto') recebido = 0;
  else recebido = Math.min(antes, cheio); // valor do serviço mudou: não deve sobrar crédito

  recebido = Math.max(0, Math.min(recebido, cheio));
  const status = recebido === 0 ? 'aberto' : recebido >= cheio ? 'pago' : 'parcial';
  return {
    recebido: recebido / 100,
    status,
    // Sem nada recebido não há forma: deixar a anterior faria a divisão por
    // forma do Financeiro herdar um pix que foi desfeito.
    forma: recebido === 0 ? 'local' : (pagamento?.forma || atual?.pag_forma || 'local'),
  };
}

/** Dinheiro se compara em centavos inteiros — 0.1 + 0.2 não fecha em ponto flutuante. */
const centavos = v => Math.round(Number(v || 0) * 100);
