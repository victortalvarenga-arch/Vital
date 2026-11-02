-- 030 · Terceiro papel: recepção.
--
-- A 005 deixou dois papéis e disse que voltar a criar um seria barato se o caso
-- aparecesse. Apareceu (2026-11-02): a secretária que marca, confirma e recebe
-- para todas as profissionais, mas não deve ver o caixa da empresa nem a
-- comissão de ninguém.
--
-- Não é o "gerente" que saiu na 005. Aquele via financeiro e cadastros; a
-- recepção vê a agenda de todas e as clientes, e mais nada. O que cada papel
-- pode está em PODERES (server/src/lib/auth.js) — aqui o banco só guarda a
-- lista de nomes válidos.
ALTER TABLE users DROP CONSTRAINT papel_valido;
ALTER TABLE users ADD CONSTRAINT papel_valido
  CHECK (papel IN ('dono', 'recepcao', 'funcionario'));
