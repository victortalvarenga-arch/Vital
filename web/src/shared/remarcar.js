import { toMin } from './tempo.js';

/**
 * Pode arrastar este atendimento para este dia e hora?
 *
 * **ATENÇÃO: isto é para a tela, não para gravar.** A validação que vale é a do
 * servidor (`server/src/lib/availability.js`), dentro da mesma transação que
 * grava — duas pessoas podem arrastar para o mesmo buraco no mesmo segundo, e
 * só lá dá para recusar a segunda. O que esta função faz é evitar que a pessoa
 * arraste até um lugar impossível e só descubra depois de soltar: enquanto o
 * dedo está em cima, o fantasma já diz "não dá, e por quê".
 *
 * Devolve `{ ok }` ou `{ ok: false, motivo }` — motivo é frase curta, porque
 * vira rótulo flutuante embaixo do cursor, não parágrafo.
 */
export function podeRemarcar({
  agendamento, para, profissional, servico, agendamentos, bloqueios = [], agora,
}) {
  const { data, hora } = para;
  // Na grade do dia, a coluna é a profissional: soltar na coluna ao lado é
  // trocar quem atende, no mesmo horário. Por isso o "é o mesmo lugar" tem de
  // olhar os três, e não só dia e hora.
  const destino = para.prof || agendamento.prof;
  if (data === agendamento.data && hora === agendamento.hora && destino === agendamento.prof) {
    return { ok: false, motivo: 'mesmo horário', igual: true };
  }

  // Atendimento que já aconteceu não se arrasta: mexer nele é pelo detalhe,
  // onde há registro de quem mudou o quê.
  if (agendamento.status === 'concluido' || agendamento.status === 'falta') {
    return { ok: false, motivo: 'já aconteceu' };
  }

  const ini = toMin(hora);
  const fim = ini + agendamento.duracao;

  // Passado não se agenda arrastando. Registrar atendimento que já aconteceu
  // existe — é a janela de novo agendamento, que pergunta antes. Aqui seria
  // sem querer, com o dedo.
  if (agora) {
    if (data < agora.data) return { ok: false, motivo: 'já passou' };
    if (data === agora.data && ini < toMin(agora.hora)) return { ok: false, motivo: 'já passou' };
  }

  // Quem vai atender precisa fazer o serviço. Lista vazia quer dizer "qualquer
  // uma" — é como o cadastro representa serviço sem restrição —, e por isso a
  // recusa só vale quando há lista. Sem esta conferência, arrastar para a
  // coluna ao lado marcava a manicure para fazer limpeza de pele.
  if (destino !== agendamento.prof && servico?.profissionais?.length
      && !servico.profissionais.includes(destino)) {
    return { ok: false, motivo: `${primeiroNome(profissional)} não faz esse serviço` };
  }

  // Jornada de quem atende, no dia da semana do destino.
  const dia = String(new Date(`${data}T12:00:00`).getDay());
  const jornada = profissional?.jornada?.[dia];
  if (!jornada) return { ok: false, motivo: `${primeiroNome(profissional)} não trabalha nesse dia` };
  if (ini < toMin(jornada[0]) || fim > toMin(jornada[1])) {
    return { ok: false, motivo: 'fora do horário de trabalho' };
  }

  // Outro atendimento na mesma cadeira. Ele mesmo não conta: arrastar meia hora
  // para o lado não é conflito consigo.
  const bate = agendamentos.some(o =>
    o.id !== agendamento.id
    && o.prof === destino
    && o.data === data
    && o.status !== 'cancelado'
    && ini < toMin(o.hora) + o.duracao && fim > toMin(o.hora));
  if (bate) return { ok: false, motivo: 'horário ocupado' };

  // Bloqueio sem dono fecha a empresa toda.
  const fechado = bloqueios.some(b =>
    b.data === data
    && (!b.profissionalId || b.profissionalId === destino)
    && ini < toMin(b.horaFim) && fim > toMin(b.horaIni));
  if (fechado) return { ok: false, motivo: 'horário bloqueado' };

  return { ok: true };
}

const primeiroNome = p => (p?.nome || 'Quem atende').split(' ')[0];
