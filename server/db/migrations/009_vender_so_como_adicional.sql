-- 009 · Serviço que só se vende junto de outro.
--
-- No Bloco 6c, um adicional passou a ser um `service` comum indicado como extra
-- de outro. Foi a decisão certa — ele já tem preço, duração, foto e quem
-- executa, sem duplicar nada, e "depilação de nariz" pode ser vendida sozinha e
-- como extra da limpeza de pele, com o mesmo cadastro.
--
-- O que faltou foi o outro caso: o extra que NÃO se vende sozinho. Cadastrar
-- "depilação de buço" para oferecer junto da limpeza também a colocava na
-- vitrine, na lista da categoria dela, agendável por três minutos. Desligar
-- `ativo` não resolve: `ativo = 0` quer dizer "arquivado", e o motor recusa
-- arquivado como extra — a empresa perderia as duas coisas.
--
-- Daí uma coluna própria, em vez de dar um segundo sentido a um campo que já
-- tem um. Ela responde uma pergunta só: aparece sozinho na vitrine?

ALTER TABLE services ADD COLUMN somente_adicional INTEGER NOT NULL DEFAULT 0;

-- Serviço marcado assim continua ativo, continua no painel e continua sendo
-- aceito como extra. O que ele deixa de ser é serviço principal — e a recusa
-- vive na gravação, não só na tela: id circula, e esconder da lista nunca foi
-- controle de nada.
COMMENT ON COLUMN services.somente_adicional IS
  'Não aparece sozinho na vitrine nem pode ser o serviço principal de um agendamento.';
