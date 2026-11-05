-- 034 · Passou da hora sem ninguém marcar: pendente, e não concluído.
--
-- Até aqui o fechamento automático transformava em `concluido` e pago tudo o
-- que passava do horário (ver `jobs/fechamento.js`). A aposta era que o WhatsApp
-- confirmaria quem veio; ele ainda não responde, e a aposta virou dado
-- inventado: a falta que ninguém marcava entrava como comparecimento, a cliente
-- recebia "como foi seu atendimento?", e o caixa contava dinheiro que ninguém
-- viu entrar.
--
-- Decisão do dono (2026-11-04):
--
--   * passou da hora sem marcação → `pendente`. Alguém da equipe confirma
--     depois — "todos vieram" em lote, ou falta uma a uma;
--   * o pagamento desse atendimento é PRESUMIDO: o caixa mostra o recebido
--     confirmado e, em linha separada, o estimado. Confirmar a presença não
--     confirma o dinheiro — ele continua presumido até alguém registrar o
--     recebimento.
--
-- ---------------------------------------------------------------------------
-- Por que uma coluna, e não um valor de `pag_status`
-- ---------------------------------------------------------------------------
-- `pag_status` é derivado de `pag_recebido` (018) e só diz quanto entrou.
-- "Presumido" é outra pergunta — o sistema supôs, ninguém disse — e precisa
-- conviver com qualquer um dos três: a entrada de R$ 20 paga no pix é
-- `parcial` E o resto é presumido. Um quarto valor no mesmo campo obrigaria a
-- escolher qual das duas coisas dizer.
--
-- `pag_recebido` NÃO é preenchido pelo fechamento: o recebido é só o que
-- alguém registrou. O estimado é `valor - pag_recebido` das linhas presumidas.

ALTER TABLE appointments DROP CONSTRAINT status_valido;
ALTER TABLE appointments ADD CONSTRAINT status_valido CHECK (
  status IN ('agendado', 'confirmado', 'em_atendimento', 'pendente', 'concluido', 'falta', 'cancelado')
);

COMMENT ON COLUMN appointments.status IS
  'agendado|confirmado|em_atendimento|pendente|concluido|falta|cancelado — pendente: passou da hora e ninguém marcou';

ALTER TABLE appointments ADD COLUMN pag_presumido INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN appointments.pag_presumido IS
  '1 = o fechamento supôs que o resto foi pago no balcão; some quando alguém registra o pagamento, ou se virar falta/cancelado';

-- ---------------------------------------------------------------------------
-- O funil espera o pendente virar alguma coisa
-- ---------------------------------------------------------------------------
-- A compactação (016) congela o "compareceu" de um dia quando nenhum
-- agendamento nascido dele está no futuro. Pendente está no passado e ainda
-- vai mudar — vira concluído ou falta quando a equipe confirmar. Fechar o dia
-- antes gravaria para sempre um comparecimento menor que o real.
CREATE OR REPLACE FUNCTION plataforma.compactar_funil(retencao_dias INT DEFAULT 90)
RETURNS TABLE (dias_fechados BIGINT, linhas_apagadas BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  limite    TEXT := to_char(now() - make_interval(days => retencao_dias), 'YYYY-MM-DD');
  amanha    TEXT := to_char(now() + interval '1 day', 'YYYY-MM-DD');
  fechados  BIGINT := 0;
  apagadas  BIGINT := 0;
BEGIN
  WITH fechaveis AS (
    SELECT f.tenant_id, f.data
      FROM funil f
     WHERE f.data <= limite
     GROUP BY f.tenant_id, f.data
    HAVING NOT EXISTS (
      SELECT 1
        FROM funil g
        JOIN appointments a ON a.id = g.appointment_id AND a.tenant_id = g.tenant_id
       WHERE g.tenant_id = f.tenant_id AND g.data = f.data
         AND (a.data >= amanha OR a.status = 'pendente')
    )
  ),
  somados AS (
    SELECT f.tenant_id, f.data,
           count(*) FILTER (WHERE f.etapa = 'site')        AS site,
           count(*) FILTER (WHERE f.etapa = 'agendamento') AS agendamento,
           count(*) FILTER (WHERE f.etapa = 'horario')     AS horario,
           count(*) FILTER (WHERE f.etapa = 'confirmou')   AS confirmou,
           count(*) FILTER (WHERE f.etapa = 'confirmou' AND a.status = 'concluido') AS compareceu
      FROM funil f
      JOIN fechaveis x ON x.tenant_id = f.tenant_id AND x.data = f.data
      LEFT JOIN appointments a ON a.id = f.appointment_id AND a.tenant_id = f.tenant_id
     GROUP BY f.tenant_id, f.data
  ),
  gravados AS (
    INSERT INTO funil_diario (tenant_id, data, site, agendamento, horario, confirmou, compareceu)
    SELECT tenant_id, data, site, agendamento, horario, confirmou, compareceu FROM somados
    ON CONFLICT (tenant_id, data) DO NOTHING
    RETURNING tenant_id, data
  )
  SELECT count(*) INTO fechados FROM gravados;

  WITH removidos AS (
    DELETE FROM funil f
     USING funil_diario d
     WHERE d.tenant_id = f.tenant_id AND d.data = f.data
    RETURNING f.tenant_id
  )
  SELECT count(*) INTO apagadas FROM removidos;

  RETURN QUERY SELECT fechados, apagadas;
END;
$$;

-- O que o fechamento antigo já concluiu e quitou fica como está: não há como
-- saber, linha a linha, quem de fato veio. Desde a 031 os fechamentos têm
-- evento com `origem = 'fechamento'`, para quem precisar separar.
