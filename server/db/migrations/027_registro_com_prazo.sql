-- O registro do painel (`logs`) guarda dois anos.
--
-- Decidido pelo dono em 2026-10-28. Dois anos respondem a qualquer "quem mexeu
-- nisso no ano passado?" e param a tabela de crescer para sempre — com uma
-- empresa movimentada são milhares de linhas por mês.
--
-- `vital_app` continua sem DELETE em `logs` (migration 011): registro não se
-- apaga de dentro, nem por engano numa rota. A poda é esta função, que roda com
-- os poderes do dono do banco e só alcança o que passou do prazo. Mesmo
-- desenho de `plataforma.compactar_funil` (016).
--
-- Atravessa todas as empresas de uma vez, como o funil: prazo é regra da
-- plataforma, não escolha de cada empresa.
CREATE FUNCTION plataforma.podar_registro(retencao_dias INT DEFAULT 730)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  apagadas BIGINT;
BEGIN
  -- Menos de um ano nunca: um parâmetro errado vindo do ambiente não pode
  -- virar "apaga o registro de ontem".
  IF retencao_dias < 365 THEN
    RAISE EXCEPTION 'retenção do registro abaixo de um ano: %', retencao_dias;
  END IF;
  DELETE FROM logs WHERE criado_em < now() - make_interval(days => retencao_dias);
  GET DIAGNOSTICS apagadas = ROW_COUNT;
  RETURN apagadas;
END;
$$;

REVOKE ALL ON FUNCTION plataforma.podar_registro(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plataforma.podar_registro(INT) TO vital_app;
