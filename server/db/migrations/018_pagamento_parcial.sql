-- 018 · Entrada: "pagou 20, falta 25".
--
-- ---------------------------------------------------------------------------
-- Por que uma coluna de valor, e não só um status
-- ---------------------------------------------------------------------------
-- `pag_status` era tudo ou nada. Quem recebe metade na chegada e o resto na
-- saída — rotina de balcão — não tinha onde registrar: ou mentia dizendo pago,
-- e o caixa contava dinheiro que não entrou, ou deixava aberto, e o mesmo caixa
-- esquecia o que já estava na gaveta. As duas saídas erram o número que o dono
-- olha no fim do dia.
--
-- `pag_recebido` guarda quanto entrou. `pag_status` continua existindo, mas
-- deixa de ser o dado: passa a ser derivado, sempre, por quem escreve
-- (`routes/agendamentos.js`) —
--
--     0             → aberto
--     0 < x < valor → parcial
--     x >= valor    → pago
--
-- Dois lugares dizendo a mesma coisa é um lugar para divergir; aqui o valor
-- manda, e o status é conveniência de quem filtra.
--
-- ---------------------------------------------------------------------------
-- Uma forma de pagamento, e não uma tabela de pagamentos
-- ---------------------------------------------------------------------------
-- A modelagem completa seria `appointment_payments`, uma linha por recebimento,
-- com forma e valor em cada. Ela responde "entrou 20 em pix e 25 em dinheiro",
-- que esta coluna não responde: `pag_forma` guarda a forma do ÚLTIMO
-- recebimento, e a divisão por forma do Financeiro credita a ela tudo o que
-- entrou naquele atendimento.
--
-- Ficou de fora porque o histórico já existe em `logs` — toda alteração de
-- pagamento passa pelo `PUT` e fica registrada com quem, quando e de quanto
-- para quanto —, e porque a tabela custaria RLS, rota, e mudar toda consulta de
-- dinheiro do sistema para um caso que, no balcão, é minoria. O desacerto está
-- escrito em `ROADMAP.md`, em "Achados", para não voltar como surpresa.
--
-- ---------------------------------------------------------------------------
-- O preenchimento
-- ---------------------------------------------------------------------------
-- Quem estava pago passa a ter o valor inteiro recebido; o resto fica em zero.
-- Sem isto, todo faturamento já registrado sumiria da tela no dia do deploy —
-- as consultas passam a somar `pag_recebido`, não `valor`.

ALTER TABLE appointments
  ADD COLUMN pag_recebido NUMERIC(10,2) NOT NULL DEFAULT 0;

UPDATE appointments SET pag_recebido = valor WHERE pag_status = 'pago';

COMMENT ON COLUMN appointments.pag_recebido IS
  'quanto já entrou, em reais — 0, parte do valor, ou o valor inteiro';

COMMENT ON COLUMN appointments.pag_status IS
  'aberto|parcial|pago — derivado de pag_recebido, nunca escrito sozinho';
