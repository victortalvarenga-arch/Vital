-- 041 · A conta Google da cliente é única por empresa, e vínculo pedido não é
-- vínculo feito.
--
-- A coluna `clients.google_sub` nasceu na 001 pensando no login da cliente, com
-- um índice único GLOBAL: `UNIQUE (google_sub)`, sem `tenant_id`. É o único
-- índice único de tabela de negócio que não é por empresa, e com o login
-- entrando (ROADMAP, Bloco 4c, etapa 8) ele quebraria o caso mais comum que
-- existe: a mesma mulher sendo cliente de duas empresas da Vital — o salão e a
-- clínica. A segunda gravação falharia por colisão com uma linha que o RLS
-- esconde dela: erro sem explicação possível na tela, e um vazamento pequeno
-- (a falha conta que aquela conta existe em outra empresa). A coluna está
-- vazia em todo banco, então o conserto não migra dado nenhum.
--
-- **Vínculo pendente.** Quando a cliente entra com o Google e o telefone que
-- ela digita já tem ficha SEM conta ligada, ninguém liga nada na hora: quem
-- está do outro lado pode ter digitado o número de outra pessoa, e ligar seria
-- dar a ficha alheia a quem errou um dígito (é o mesmo buraco do Bloco 4b, com
-- consequência maior). O pedido fica guardado e quem confirma é a profissional,
-- no painel.
--
-- Colunas em `clients`, e não tabela à parte: o pedido pertence à ficha, uma
-- ficha tem no máximo um pedido em pé, `clients` já viaja inteira para o painel
-- (a ficha mostra o pedido sem consulta nova), o RLS cobre de graça, e recusar
-- é limpar as colunas — quem recusou e quando já fica no `logs`. Uma tabela
-- daria histórico de pedidos, que ninguém pediu, ao preço de mais uma tabela
-- com RLS e mais uma consulta no caminho da ficha.
--
-- O pedido NÃO tem índice único: a mesma pessoa pode pedir vínculo em duas
-- fichas (digitou dois números seus), e enquanto ninguém confirma nada colide.
-- A unicidade é do vínculo feito.

DROP INDEX idx_clients_google;

CREATE UNIQUE INDEX idx_clients_google ON clients(tenant_id, google_sub)
  WHERE google_sub IS NOT NULL;

ALTER TABLE clients ADD COLUMN google_sub_pendente TEXT;
ALTER TABLE clients ADD COLUMN email_pendente      TEXT NOT NULL DEFAULT '';
ALTER TABLE clients ADD COLUMN vinculo_pedido_em   TEXT;

COMMENT ON COLUMN clients.google_sub_pendente IS
  'Conta Google que pediu para ser ligada a esta ficha e ainda não foi confirmada no painel. O vínculo feito é google_sub.';
COMMENT ON COLUMN clients.email_pendente IS
  'E-mail da conta do pedido acima, para a profissional reconhecer quem pediu. Vazio quando não há pedido.';
COMMENT ON COLUMN clients.vinculo_pedido_em IS
  'YYYY-MM-DD do pedido — um pedido velho não deve ser confirmado às cegas.';
