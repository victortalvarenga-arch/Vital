-- 020 · Comissão por serviço, e por pessoa dentro do serviço.
--
-- ---------------------------------------------------------------------------
-- Três níveis, do mais específico para o mais geral
-- ---------------------------------------------------------------------------
-- Até aqui a comissão era só da profissional: a Bia ganha 40% de tudo o que
-- atende. Não dá conta do salão que paga 10% num procedimento caro e 40% num
-- corte, nem da sênior que ganha mais que a colega no mesmo serviço.
--
--   service_staff.comissao  → esta pessoa, neste serviço   (a exceção)
--   services.comissao       → este serviço, para quem fizer (a tabela)
--   staff.comissao          → esta pessoa, no resto         (o que já existia)
--
-- Vale o primeiro preenchido. Nulo quer dizer "não decide aqui, olha o de
-- cima" — por isso nulo e não zero: zero é uma comissão de verdade ("este
-- serviço não paga comissão"), e confundir os dois tiraria o dinheiro de
-- alguém em silêncio.
--
-- A regra mora numa expressão só, em `routes/relatorios.js` (TAXA). Toda conta
-- de comissão passa por ela; escrever o COALESCE de novo em outro lugar é
-- abrir espaço para os números do Resumo e do Financeiro discordarem.
--
-- ---------------------------------------------------------------------------
-- A observação
-- ---------------------------------------------------------------------------
-- `descricao` aparece no site. `obs` é o oposto: nota interna da equipe
-- ("usar o ácido só em pele sem lesão"), e nunca sai na vitrine — a rota
-- pública tira o campo explicitamente, e há teste para isso.

ALTER TABLE services      ADD COLUMN comissao NUMERIC(5,2);
ALTER TABLE services      ADD COLUMN obs      TEXT NOT NULL DEFAULT '';
ALTER TABLE service_staff ADD COLUMN comissao NUMERIC(5,2);
