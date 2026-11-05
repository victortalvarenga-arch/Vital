-- 032 · Apagar um agendamento não apaga a ficha de saúde nem o que foi enviado.
--
-- Desde a 012 a anamnese aponta para o atendimento com ON DELETE CASCADE, e as
-- mensagens com o mesmo CASCADE desde a 001. Na prática, o botão "apagar" de um
-- horário levava junto:
--
--   - a ficha que a cliente respondeu naquele dia — que a própria 012 chama de
--     registro que não se reescreve, e que a aplicação nem pode editar (REVOKE
--     UPDATE). Apagar por tabela era a única porta para fazer sumir o que a
--     regra mandava guardar;
--   - as mensagens já ENVIADAS. A rota apaga as pendentes de propósito (lembrete
--     de horário que não existe mais); as enviadas são o que a clínica de fato
--     disse à cliente, e sumiam junto sem ninguém pedir.
--
-- Passa a SET NULL: a ficha continua da cliente (client_id) e a mensagem
-- continua no histórico, só sem o atendimento de origem. `fichasDaCliente` já
-- lê com LEFT JOIN e mostra a ficha sem data de atendimento; a funcionária, que
-- só vê fichas dos atendimentos dela, deixa de ver esta — quem vê é o dono.
--
-- `appointment_addons` continua em CASCADE: o extra não existe sem o
-- atendimento, e o que foi vendido fica na foto do evento 'apagado' (031).

ALTER TABLE form_answers DROP CONSTRAINT form_answers_appointment_id_fkey;
ALTER TABLE form_answers ADD CONSTRAINT form_answers_appointment_id_fkey
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL;

ALTER TABLE messages DROP CONSTRAINT messages_appointment_id_fkey;
ALTER TABLE messages ADD CONSTRAINT messages_appointment_id_fkey
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL;
