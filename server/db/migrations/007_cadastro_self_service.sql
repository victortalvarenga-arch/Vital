-- 007 · Deixar a aplicação criar empresa.
--
-- Até aqui só a migration criava linha em `plataforma.tenants`: nascer empresa
-- nova dependia de alguém com credencial de administrador rodar SQL. Isso
-- basta para um cliente; não basta para um produto que se vende sozinho.
--
-- A permissão é estreita de propósito. `plataforma.tenants` é cadastro nosso e
-- não tem RLS — quem lê é a plataforma —, mas o dado de negócio de cada empresa
-- continua atrás das políticas das tabelas de `public`. Poder inserir uma
-- empresa não dá à aplicação nenhum acesso novo ao que já existe: ela continua
-- enxergando só a empresa marcada na conexão.
--
-- DELETE segue fora. Apagar empresa é operação de plataforma, com backup e
-- registro; a aplicação suspende (`ativo = 0`), que é reversível.

GRANT INSERT ON plataforma.tenants TO vital_app;

-- Slug é o subdomínio: `lume` em `lume.vital.app`. O UNIQUE já existia; a
-- restrição de formato não. Sem ela, um cadastro com espaço ou maiúscula gera
-- um endereço que nunca resolve, e o erro só aparece quando a empresa tenta
-- abrir o próprio site.
ALTER TABLE plataforma.tenants
  ADD CONSTRAINT slug_e_endereco_valido CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$');

-- Domínio próprio é opcional, mas quando existe precisa ser único: dois
-- registros com o mesmo host fariam a resolução depender da ordem da consulta.
-- Índice parcial porque a coluna guarda '' quando não há domínio, e vazio se
-- repete à vontade.
CREATE UNIQUE INDEX idx_tenants_dominio
  ON plataforma.tenants (dominio) WHERE dominio <> '';
