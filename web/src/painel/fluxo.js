import { api } from '../shared/painel-api.js';

/**
 * O caminho de um atendimento, do dia marcado até o fim.
 *
 * Cada etapa mostra **uma** ação: a seguinte. A lista inteira de estados fica
 * atrás do "Alterar" — quem precisa dela está corrigindo alguma coisa, e
 * corrigir é o caso raro. Mostrar os seis botões o tempo todo fazia a pessoa
 * escolher entre seis quando só um fazia sentido naquele momento.
 *
 * Mora fora do App.jsx porque a Agenda e o Resumo dão o mesmo passo — "Cliente
 * chegou" no cartão da próxima cliente é o mesmo botão da gaveta.
 */
export const FLUXO = {
  agendado:       { rotulo: 'Agendado',       tom: 'espera',  proximo: 'confirmado',     acao: 'Confirmar' },
  confirmado:     { rotulo: 'Confirmado',     tom: 'ok',      proximo: 'em_atendimento', acao: 'Cliente chegou' },
  em_atendimento: { rotulo: 'Em atendimento', tom: 'agora',   proximo: 'concluido',      acao: 'Concluir' },
  concluido:      { rotulo: 'Concluído',      tom: 'feito' },
  falta:          { rotulo: 'Faltou',         tom: 'falta' },
  cancelado:      { rotulo: 'Cancelado',      tom: 'ruim' },
};

/**
 * Muda a situação de um atendimento, com o aviso que diz de quem e para onde
 * ("Maria: faltou") e traz "Desfazer". Um toque errado entre uma cliente e
 * outra registrava falta sem volta na hora — a correção existia, mas atrás do
 * "Alterar" da gaveta.
 */
export function mudarSituacao({ acao, agendamentos, clientes, irPara }, id, status) {
  const antes = agendamentos.find(a => a.id === id);
  const nome = clientes.find(c => c.id === antes?.cliente)?.nome.split(' ')[0];
  const de = nome ? `${nome}: ` : '';
  const volta = antes && antes.status !== status ? antes.status : null;
  // Concluir sem ter recebido deixava a cliente sair "a receber" sem ninguém
  // ver: o aviso diz quanto falta e leva à gaveta, onde se recebe.
  const falta = antes ? Number(antes.valor || 0) - Number(antes.pagamento?.recebido || 0) : 0;
  const cobrar = status === 'concluido' && falta > 0 && irPara;
  return acao(() => api.atualizarAgendamento(id, { status }), {
    texto: de + FLUXO[status].rotulo.toLowerCase() + (cobrar ? ' · falta receber' : ''),
    desfazer: volta && (() => acao(
      () => api.atualizarAgendamento(id, { status: volta }),
      `${de}voltou para ${FLUXO[volta].rotulo.toLowerCase()}`
    )),
    ...(cobrar ? { extra: { rotulo: 'Receber', ir: () => irPara('agenda', { abrir: id }) } } : {}),
  });
}
