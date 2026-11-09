-- 036 · Mensagem tem prazo; reativação sai da fila.
--
-- A fila só dizia quando uma mensagem podia sair (`agendado_para`), nunca até
-- quando ela fazia sentido. Sem número conectado, quem não tocava em "Enviar"
-- deixava o lembrete lá para sempre: "seu horário é hoje às 14h" continuava na
-- fila dias depois do horário. Pior com número conectado: uma queda do servidor
-- faria o despacho entregar esse lembrete atrasado para a cliente de verdade.
--
-- `expira_em` é decidido por quem cria a mensagem, que é quem sabe o que ela
-- promete. O status 'expirado' guarda o que venceu sem sair: a linha continua,
-- e a `dedupe_key` dela impede que a próxima passada de `gerarFila` a recrie.
--
-- A reativação deixa de ser mensagem na fila (decisão do dono, 2026-11-05):
-- não tem prazo nem obrigação, e misturada aos lembretes parecia tarefa
-- atrasada. Vira a aba Recuperação, onde mandar é opção de quem olha.

ALTER TABLE messages ADD COLUMN expira_em TEXT;

COMMENT ON COLUMN messages.expira_em IS
  '''YYYY-MM-DD HH:MM'' a partir de quando não faz mais sentido enviar; NULL = sem prazo';
COMMENT ON COLUMN messages.status IS 'pendente|enviado|erro|pulado|expirado';
COMMENT ON COLUMN templates.tipo IS 'auto|campanha|recuperacao';

-- Reativação pendente nunca saiu: não há o que guardar. Fica antes do prazo das
-- demais para não receber um à toa.
DELETE FROM messages WHERE template_chave = 'reativacao' AND status = 'pendente';

UPDATE templates
   SET tipo = 'recuperacao', quando = 'Enviada por você, na aba Recuperação'
 WHERE chave = 'reativacao';
UPDATE templates SET titulo = 'Saudade'
 WHERE chave = 'reativacao' AND titulo = 'Saudade (60 dias sem voltar)';

-- O que já está na fila ganha o prazo que teria ganhado ao nascer. O primeiro
-- `expirarFila` depois do deploy limpa o que já venceu.
UPDATE messages m
   SET expira_em = a.data || ' ' || a.hora
  FROM appointments a
 WHERE a.id = m.appointment_id AND m.status = 'pendente'
   AND m.template_chave IN ('confirmacao', 'lembrete_vespera', 'lembrete_dia');

UPDATE messages m
   SET expira_em = to_char(a.data::date + 7, 'YYYY-MM-DD') || ' 23:59'
  FROM appointments a
 WHERE a.id = m.appointment_id AND m.status = 'pendente'
   AND m.template_chave = 'pos_atendimento';

UPDATE messages
   SET expira_em = left(agendado_para, 10) || ' 23:59'
 WHERE status = 'pendente' AND template_chave = 'vaga';

-- Aniversário sem o antecedente guardado e campanhas: uma semana a partir de
-- quando foram programados, que é o prazo que passam a nascer com.
UPDATE messages
   SET expira_em = to_char(left(agendado_para, 10)::date + 7, 'YYYY-MM-DD') || ' 23:59'
 WHERE status = 'pendente' AND expira_em IS NULL;
