-- 021 · Promoção com começo, dias da semana e limite — e o desconto gravado.
--
-- ---------------------------------------------------------------------------
-- Quando vale
-- ---------------------------------------------------------------------------
-- O período e os dias da semana valem para a DATA DO ATENDIMENTO, não para o
-- dia em que a cliente agenda. "Terça da beleza" é para quem é atendida na
-- terça; agendar na segunda para a terça seguinte entra. É o que a cliente
-- entende ao ler a promoção, e o calendário do site só oferece os dias que
-- cabem nela.
--
-- `valido_de` no futuro deixa a promoção AGENDADA: fora do site até o dia
-- começar. Vender antes seria a pré-venda, outra decisão de negócio.
--
-- `dias_semana` nulo é todo dia. Array de 0 (domingo) a 6, como `getDay()`.
--
-- ---------------------------------------------------------------------------
-- Pausar não é arquivar
-- ---------------------------------------------------------------------------
-- `ativo = 0` era o "apagar": os agendamentos vendidos apontam para o combo, e
-- a linha não pode sumir. Com o botão de pausar, `ativo` passa a ser só isso —
-- liga e desliga —, e o arquivo ganha coluna própria. As que estavam com
-- `ativo = 0` foram arquivadas pelo apagar (pausa não existia), e é como ficam.
--
-- ---------------------------------------------------------------------------
-- O limite
-- ---------------------------------------------------------------------------
-- `limite_usos` conta VENDAS (um `combo_grupo`) não canceladas: a falta conta,
-- porque a vaga foi vendida e ocupada na agenda. Nulo é sem limite. A
-- conferência acontece dentro da transação da venda, com trava por combo
-- (`pg_advisory_xact_lock`): duas clientes no mesmo segundo não passam a
-- última vaga para as duas.
--
-- ---------------------------------------------------------------------------
-- O desconto, gravado na linha
-- ---------------------------------------------------------------------------
-- `appointments.desconto` é quanto saiu do preço de tabela NAQUELA venda —
-- preço do serviço no dia menos o `valor` rateado. Calcular depois, com a
-- tabela de hoje, daria outro número a cada reajuste: o "desconto concedido"
-- do mês passado mudaria sozinho. Zero em tudo que não é promoção.
--
-- As vendas antigas não sabem o preço do dia em que foram feitas: o
-- preenchimento abaixo usa a tabela de hoje, e nunca fica negativo. É
-- aproximação, e só para o que já existia.

ALTER TABLE combos ADD COLUMN valido_de   TEXT;          -- 'YYYY-MM-DD'
ALTER TABLE combos ADD COLUMN dias_semana INTEGER[];
ALTER TABLE combos ADD COLUMN limite_usos INTEGER;
ALTER TABLE combos ADD COLUMN arquivado   INTEGER NOT NULL DEFAULT 0;
UPDATE combos SET arquivado = 1 WHERE ativo = 0;

ALTER TABLE appointments ADD COLUMN desconto NUMERIC(10,2) NOT NULL DEFAULT 0;
UPDATE appointments a
   SET desconto = GREATEST(0, s.preco - a.valor)
  FROM services s
 WHERE s.id = a.service_id AND a.combo_id IS NOT NULL;
