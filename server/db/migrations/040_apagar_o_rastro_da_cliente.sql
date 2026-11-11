-- 040 · Apagar a cliente apaga o rastro — o caminho de exclusão da LGPD.
--
-- Apagar a ficha não bastava, por dois motivos que ninguém via na tela:
--
-- 1. `messages.client_id` referencia `clients` sem ON DELETE nenhum (001):
--    cliente que já tinha recebido um lembrete NÃO PODIA ser apagada — a
--    chave estrangeira derrubava o DELETE e a requisição morria em 500.
-- 2. `appointment_events` guarda `client_id` e a aplicação não tem UPDATE nem
--    DELETE nele (031, de propósito). A ficha sumia, mas os eventos seguiam
--    ligando os atendimentos da pessoa entre si por um id que era só dela.
--
-- As mensagens e as conversas do WhatsApp quem apaga é a própria rota — a
-- aplicação tem DELETE nas duas tabelas. Os eventos precisam desta função:
-- `SECURITY DEFINER` é a única porta que atravessa o REVOKE da 031 (o mesmo
-- desenho de `compactar_funil`, na 016), e ela faz UMA coisa só — trocar o
-- `client_id` por vazio, na empresa da transação. O percurso continua
-- contável ("um atendimento foi criado e cancelado"); o fio que ligava os
-- atendimentos à pessoa some.
--
-- A empresa vem de `current_setting('app.tenant_id')`, nunca de argumento:
-- função que aceita empresa como parâmetro grava na empresa errada no dia em
-- que alguém errar o argumento — a mesma regra das ferramentas do atendente.

CREATE FUNCTION plataforma.apagar_rastro_da_cliente(cliente TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  empresa TEXT := NULLIF(current_setting('app.tenant_id', true), '');
  n BIGINT;
BEGIN
  IF empresa IS NULL THEN
    RAISE EXCEPTION 'apagar_rastro_da_cliente precisa de uma transação com empresa marcada';
  END IF;
  UPDATE appointment_events
     SET client_id = ''
   WHERE tenant_id = empresa AND client_id = cliente;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION plataforma.apagar_rastro_da_cliente(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plataforma.apagar_rastro_da_cliente(TEXT) TO vital_app;
