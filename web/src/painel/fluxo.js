import { api } from '../shared/painel-api.js';
import { toMin } from '../shared/tempo.js';

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
  agendado:       { rotulo: 'A confirmar',    tom: 'espera',  proximo: 'confirmado',     acao: 'Confirmar' },
  confirmado:     { rotulo: 'Confirmado',     tom: 'ok',      proximo: 'em_atendimento', acao: 'Cliente chegou' },
  em_atendimento: { rotulo: 'Em atendimento', tom: 'agora',   proximo: 'concluido',      acao: 'Concluir' },
  // Do relógio, não de ninguém: passou da hora e nada foi marcado (migration
  // 034). O passo seguinte é alguém dizer que ela veio; a falta fica ao lado,
  // como em qualquer horário que já começou.
  pendente:       { rotulo: 'Sem marcação',   tom: 'espera',  proximo: 'concluido',      acao: 'Cliente veio' },
  concluido:      { rotulo: 'Concluído',      tom: 'feito' },
  falta:          { rotulo: 'Faltou',         tom: 'falta' },
  cancelado:      { rotulo: 'Cancelado',      tom: 'ruim' },
};

/**
 * A próxima de cada profissional, hoje: a primeira marcada (a confirmar ou
 * confirmada) que ainda não terminou. É a mesma regra do cartão "Próxima
 * cliente" do Resumo, aplicada por pessoa — na grade do dia cada coluna tem a
 * sua próxima, e é ela que ganha o destaque.
 */
export function proximasDoDia(agendamentos, hoje, minAgora) {
  const ids = new Set();
  const vistas = new Set();
  const doDia = agendamentos
    .filter(a => a.data === hoje && (a.status === 'agendado' || a.status === 'confirmado')
      && toMin(a.hora) + (a.duracao || 0) > minAgora)
    .sort((a, b) => a.hora.localeCompare(b.hora));
  for (const a of doDia) {
    if (vistas.has(a.prof)) continue;
    vistas.add(a.prof);
    ids.add(a.id);
  }
  return ids;
}

/**
 * "Todos vieram": confirma a presença dos atendimentos sem marcação que a tela
 * está mostrando. O aviso do Resumo e a Lista da Agenda usam esta mesma função,
 * com o mesmo "Desfazer" — que devolve um a um para "sem marcação", o estado de
 * antes. O pagamento continua presumido: presença não é dinheiro.
 */
export function confirmarTodos({ acao }, ids) {
  const n = ids.length;
  return acao(() => api.confirmarPresenca(ids), {
    texto: n === 1 ? 'Presença confirmada' : `${n} presenças confirmadas`,
    desfazer: () => acao(async () => {
      for (const id of ids) await api.atualizarAgendamento(id, { status: 'pendente' });
    }, n === 1 ? 'Voltou para sem marcação' : `${n} voltaram para sem marcação`),
  });
}

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
  // Presumido não é dívida: o sistema supôs que ela pagou no balcão, e cobrar
  // a cada confirmação de presença seria cobrar de quem provavelmente pagou.
  const cobrar = status === 'concluido' && falta > 0 && !antes?.pagamento?.presumido && irPara;
  return acao(() => api.atualizarAgendamento(id, { status }), {
    texto: de + FLUXO[status].rotulo.toLowerCase() + (cobrar ? ' · falta receber' : ''),
    desfazer: volta && (() => acao(
      () => api.atualizarAgendamento(id, { status: volta }),
      `${de}voltou para ${FLUXO[volta].rotulo.toLowerCase()}`
    )),
    ...(cobrar ? { extra: { rotulo: 'Receber', ir: () => irPara('agenda', { abrir: id }) } } : {}),
  });
}
