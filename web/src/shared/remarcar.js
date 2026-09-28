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
  agendamento, para, profissional, agendamentos, bloqueios = [], agora,
}) {
  const { data, hora } = para;
  if (data === agendamento.data && hora === agendamento.hora) {
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
    && o.prof === agendamento.prof
    && o.data === data
    && o.status !== 'cancelado'
    && ini < toMin(o.hora) + o.duracao && fim > toMin(o.hora));
  if (bate) return { ok: false, motivo: 'horário ocupado' };

  // Bloqueio sem dono fecha a empresa toda.
  const fechado = bloqueios.some(b =>
    b.data === data
    && (!b.profissionalId || b.profissionalId === agendamento.prof)
    && ini < toMin(b.horaFim) && fim > toMin(b.horaIni));
  if (fechado) return { ok: false, motivo: 'horário bloqueado' };

  return { ok: true };
}

const primeiroNome = p => (p?.nome || 'Quem atende').split(' ')[0];
