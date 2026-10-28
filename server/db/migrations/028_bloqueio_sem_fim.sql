-- 028 · Bloqueio que "nunca termina" passa a não terminar.
--
-- Desde a 013 cada ocorrência é uma linha em `blocks`, e por isso o "Nunca" do
-- formulário criava 12 meses de datas e parava ali, sem aviso: passado um ano
-- a folga semanal sumia e a agenda voltava a oferecer o horário. O dono
-- decidiu (2026-10-28) que a série se estende sozinha.
--
-- Para estender é preciso lembrar a REGRA, não só as datas: "toda segunda e
-- quarta, das 12 às 13". Esta tabela guarda a regra das séries sem fim; um job
-- diário cria as datas que faltam para manter sempre 12 meses à frente
-- (`jobs/bloqueios.js`). As ocorrências continuam sendo linhas comuns de
-- `blocks`, com o mesmo `serie` — o motor de horários não aprende nada novo.
--
-- `ate` é a última data já criada. O job só cria depois dela, e é isso que
-- respeita o "liberar só hoje": a ocorrência apagada ficou para trás de `ate`
-- e não volta.

CREATE TABLE bloqueio_series (
  tenant_id   TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true),
  serie       TEXT NOT NULL,
  staff_id    TEXT,                       -- nulo = a empresa toda, como em `blocks`
  hora_ini    TEXT NOT NULL,
  hora_fim    TEXT NOT NULL,
  motivo      TEXT NOT NULL DEFAULT '',
  obs         TEXT NOT NULL DEFAULT '',
  -- 'diaria' | 'semanal' | 'mensal', com os mesmos nomes da tela.
  repetir     TEXT NOT NULL CHECK (repetir IN ('diaria', 'semanal', 'mensal')),
  -- Semanal: 0 = domingo … 6 = sábado (o `getDay()` da tela).
  dias_semana INT[] NOT NULL DEFAULT '{}',
  -- A data de partida: o mensal conta os meses a partir dela.
  inicio      TEXT NOT NULL,
  ate         TEXT NOT NULL,
  PRIMARY KEY (tenant_id, serie)
);

ALTER TABLE bloqueio_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE bloqueio_series FORCE ROW LEVEL SECURITY;
CREATE POLICY isolamento_por_empresa ON bloqueio_series
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
