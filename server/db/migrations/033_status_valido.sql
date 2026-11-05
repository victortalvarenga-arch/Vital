-- 033 · O banco passa a recusar status que não existe.
--
-- `appointments.status` era TEXT livre desde a 001; a lista morava num
-- comentário (017) e em `routes/agendamentos.js`. A rota confere, mas o cron, o
-- seed, o gatilho de comissão e qualquer script escrevem direto — e um status
-- com erro de digitação ('concluído', com acento) passaria calado: não ocupa a
-- cadeira, não entra no caixa, não conta como falta. Para quem um dia for
-- medir falta e comparecimento, é linha que some de todas as contas.
--
-- Se esta migration falhar, há linha com status fora da lista. Confira antes:
--   SELECT status, count(*) FROM appointments GROUP BY status;

ALTER TABLE appointments ADD CONSTRAINT status_valido CHECK (
  status IN ('agendado', 'confirmado', 'em_atendimento', 'concluido', 'falta', 'cancelado')
);
