-- 017 · "Em atendimento": a cliente já está na cadeira.
--
-- ---------------------------------------------------------------------------
-- Por que um estado a mais
-- ---------------------------------------------------------------------------
-- Faltava a diferença entre "ela vem hoje" e "ela está aqui agora". Quem está
-- no balcão precisa das duas: a primeira organiza o dia, a segunda responde
-- "posso encaixar alguém às 14h?" e "quanto tempo a Bia ainda leva?".
--
-- Sem ele, o atalho era marcar `concluido` no começo do atendimento — e aí o
-- dinheiro entrava no caixa antes de o serviço acontecer, o pós-atendimento
-- disparava com a cliente ainda na cadeira, e "faltou" já não podia ser
-- corrigido sem desfazer um pagamento.
--
-- ---------------------------------------------------------------------------
-- Não há CHECK para alterar
-- ---------------------------------------------------------------------------
-- `appointments.status` é TEXT livre desde a 001 — a lista de valores vive no
-- comentário da coluna e em `routes/agendamentos.js`. Esta migration existe
-- para o comentário não mentir: quem abrir o banco daqui a um ano precisa ver
-- os seis estados, não cinco.
--
-- Quem ocupa a cadeira (`lib/availability.js`) e quem é fechado de madrugada
-- (`jobs/fechamento.js`) passam a contar com ele — está nos testes dos dois.

COMMENT ON COLUMN appointments.status IS
  'agendado|confirmado|em_atendimento|concluido|falta|cancelado';
