-- 022 · A comissão padrão da profissional pode ser um valor fixo.
--
-- "R$ 15 por atendimento" é tão comum quanto "40%" em barbearia e estética.
-- O fixo vale só no nível da PROFISSIONAL — o padrão dela. A comissão do
-- serviço e a exceção da pessoa no serviço (migration 020) continuam em
-- percentual e, quando preenchidas, passam por cima do padrão, fixo ou não:
-- quem configurou "o peeling paga 30%" quis dizer isso para todo mundo.
--
-- `comissao` continua sendo o percentual, usado quando o tipo é 'percentual'.
-- O fixo mora em coluna própria em vez de reaproveitar `comissao` com outro
-- sentido: toda consulta antiga lê `comissao` como percentual, e um 15 que
-- passasse a querer dizer "R$ 15" viraria 15% em silêncio na primeira que
-- alguém esquecesse de olhar o tipo.
--
-- Pagamento parcial: o fixo é proporcional ao que entrou (pagou metade, sai
-- metade do fixo), pela mesma razão do percentual incidir sobre o recebido —
-- comissão não sai de dinheiro que a empresa ainda não tem. A conta mora em
-- `comissaoCentavos()`, em `routes/relatorios.js`.

ALTER TABLE staff ADD COLUMN comissao_tipo TEXT NOT NULL DEFAULT 'percentual'
  CHECK (comissao_tipo IN ('percentual', 'fixo'));
ALTER TABLE staff ADD COLUMN comissao_fixo NUMERIC(10,2);
