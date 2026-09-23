-- 016 · O funil cru não pode crescer para sempre.
--
-- `funil` (migration 015) guarda até quatro linhas por visita ao site. Visita é
-- muito mais frequente que ação no painel, então essa tabela passa `logs` de
-- longe: com duzentas empresas e movimento de verdade, vira a maior do banco
-- em um ano.
--
-- **Podar e perder a série histórica seria o conserto errado.** A pergunta que
-- o funil responde ("a mudança que fizemos em março melhorou a conversão?")
-- precisa do ano passado. O que não precisa é da linha de cada visita: uma
-- linha por dia e empresa, com as cinco contagens, responde a tela inteira.
--
-- ---------------------------------------------------------------------------
-- O dia só fecha quando o "compareceu" parou de mudar
-- ---------------------------------------------------------------------------
-- Este é o detalhe que o desenho esconde. `compareceu` não é evento: é o join
-- com `appointments.status`, e status **muda depois**. Uma visita que confirmou
-- hoje pode virar atendimento concluído daqui a trinta dias — a empresa
-- escolhe a janela em `janelaDias`, e nada impede que seja maior.
--
-- Congelar a contagem cedo demais gravaria para sempre um comparecimento que
-- ainda ia acontecer, e o número do ano passado ficaria menor do que a verdade
-- sem ninguém nunca descobrir por quê.
--
-- Por isso a regra de fechamento tem duas condições, e não uma: o dia precisa
-- ser mais velho que a retenção **e** nenhum agendamento nascido dele pode
-- estar no futuro. Um dia com agendamento marcado para daqui a seis meses
-- simplesmente espera — fica no cru, ocupando espaço, até poder ser fechado
-- com o número certo.

CREATE TABLE funil_diario (
  tenant_id   TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true),
  data        TEXT NOT NULL,
  site        BIGINT NOT NULL DEFAULT 0,
  agendamento BIGINT NOT NULL DEFAULT 0,
  horario     BIGINT NOT NULL DEFAULT 0,
  confirmou   BIGINT NOT NULL DEFAULT 0,
  compareceu  BIGINT NOT NULL DEFAULT 0,
  fechado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, data)
);

ALTER TABLE funil_diario ENABLE ROW LEVEL SECURITY;
ALTER TABLE funil_diario FORCE ROW LEVEL SECURITY;
CREATE POLICY isolamento_por_empresa ON funil_diario
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Resumo fechado não se reescreve, pelo mesmo motivo de `funil` e `logs`. Quem
-- compacta é a função abaixo, que roda com os poderes do dono.
REVOKE UPDATE, DELETE ON funil_diario FROM vital_app;

-- ---------------------------------------------------------------------------
-- Compactar: somar o dia e apagar o cru
-- ---------------------------------------------------------------------------
-- `SECURITY DEFINER` por dois motivos. O primeiro é o de sempre: a aplicação é
-- barrada pelo RLS e isto precisa atravessar todas as empresas de uma vez. O
-- segundo é o que importa aqui — **`vital_app` não tem DELETE em `funil`**, de
-- propósito (migration 015: registro de visita não se apaga de dentro). Esta
-- função é a única porta que apaga, e ela só apaga o que já foi somado.
--
-- Insere e deleta na MESMA transação: se o delete falhar, o insert volta atrás
-- e o dia continua inteiro no cru. O contrário — somar e não apagar — só
-- custaria espaço; o perigoso seria apagar sem ter somado, e isso não existe
-- porque o DELETE só alcança o par (empresa, dia) que já está no resumo.
CREATE FUNCTION plataforma.compactar_funil(retencao_dias INT DEFAULT 90)
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
      -- Algum agendamento nascido deste dia ainda vai acontecer: o status
      -- dele pode mudar, então a contagem de "compareceu" ainda não é final.
      SELECT 1
        FROM funil g
        JOIN appointments a ON a.id = g.appointment_id AND a.tenant_id = g.tenant_id
       WHERE g.tenant_id = f.tenant_id AND g.data = f.data AND a.data >= amanha
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

  -- Só o que está no resumo. Um dia que não coube no INSERT (conflito) já
  -- estava fechado antes, e apagar o cru dele continua sendo correto.
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

REVOKE ALL ON FUNCTION plataforma.compactar_funil(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plataforma.compactar_funil(INT) TO vital_app;

-- ---------------------------------------------------------------------------
-- Ler os dois, sem contar ninguém duas vezes
-- ---------------------------------------------------------------------------
-- Um dia está no cru OU no resumo, nunca nos dois: a função acima apaga o cru
-- na mesma transação em que grava o resumo. A soma abaixo é segura por causa
-- disso — se um dia essa garantia cair, esta consulta passa a contar dobrado
-- sem nenhum erro aparecer.
CREATE OR REPLACE FUNCTION plataforma.funil_por_empresa(dias INT DEFAULT 30)
RETURNS TABLE (
  tenant_id   TEXT,
  site        BIGINT,
  agendamento BIGINT,
  horario     BIGINT,
  confirmou   BIGINT,
  compareceu  BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  WITH janela AS (
    SELECT to_char(now() - make_interval(days => dias), 'YYYY-MM-DD') AS desde
  ),
  cru AS (
    SELECT f.tenant_id,
           count(*) FILTER (WHERE f.etapa = 'site')        AS site,
           count(*) FILTER (WHERE f.etapa = 'agendamento') AS agendamento,
           count(*) FILTER (WHERE f.etapa = 'horario')     AS horario,
           count(*) FILTER (WHERE f.etapa = 'confirmou')   AS confirmou,
           count(*) FILTER (WHERE f.etapa = 'confirmou' AND a.status = 'concluido') AS compareceu
      FROM funil f
      LEFT JOIN appointments a ON a.id = f.appointment_id AND a.tenant_id = f.tenant_id
     WHERE f.data >= (SELECT desde FROM janela)
     GROUP BY f.tenant_id
  ),
  resumo AS (
    SELECT d.tenant_id,
           sum(d.site) site, sum(d.agendamento) agendamento, sum(d.horario) horario,
           sum(d.confirmou) confirmou, sum(d.compareceu) compareceu
      FROM funil_diario d
     WHERE d.data >= (SELECT desde FROM janela)
     GROUP BY d.tenant_id
  )
  SELECT t.id,
         coalesce(c.site, 0)        + coalesce(r.site, 0),
         coalesce(c.agendamento, 0) + coalesce(r.agendamento, 0),
         coalesce(c.horario, 0)     + coalesce(r.horario, 0),
         coalesce(c.confirmou, 0)   + coalesce(r.confirmou, 0),
         coalesce(c.compareceu, 0)  + coalesce(r.compareceu, 0)
    FROM plataforma.tenants t
    LEFT JOIN cru    c ON c.tenant_id = t.id
    LEFT JOIN resumo r ON r.tenant_id = t.id;
$$;
