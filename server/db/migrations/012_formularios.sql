-- 012 · Formulários: o que a empresa precisa perguntar antes de atender.
--
-- Anamnese de estética, ficha de saúde da clínica, preferências do pet, dados
-- do veículo na oficina. Cada ramo pergunta uma coisa, e nenhuma delas cabe
-- numa coluna que a gente invente aqui — por isso pergunta é linha, não campo.
--
-- ---------------------------------------------------------------------------
-- Resposta é histórico, não cadastro
-- ---------------------------------------------------------------------------
-- A ficha vive presa ao ATENDIMENTO, não à cliente. Duas razões:
--
--   1. A resposta muda com o tempo — "está grávida?", "usa qual medicação?" —
--      e a que importa é a do dia, não a última. Guardar só a mais recente
--      apagaria o motivo pelo qual um procedimento foi feito de um jeito.
--   2. A pergunta em si pode mudar. Se a resposta apontasse para a pergunta
--      viva, editar o rótulo reescreveria o passado.
--
-- Daí `respostas` ser JSONB com rótulo e valor congelados, e não uma tabela de
-- pares apontando para `form_fields`.
--
-- ---------------------------------------------------------------------------
-- Dado sensível
-- ---------------------------------------------------------------------------
-- Resposta de anamnese é dado pessoal sensível pela LGPD — saúde. Fica atrás do
-- RLS como todo o resto, nunca sai em rota pública, e o back-office da Vital não
-- a alcança: a função que conta empresas devolve número, nunca linha. Ao criar
-- rota nova que leia `form_answers`, pergunte quem precisa mesmo daquilo.

CREATE TABLE forms (
  id        TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true),
  nome      TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',   -- aparece para a cliente antes das perguntas
  ativo     INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL
);

-- As perguntas. `tipo` decide o campo que a tela desenha e como o servidor
-- valida; `opcoes` só vale para escolha e múltipla.
CREATE TABLE form_fields (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true),
  form_id     TEXT NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  rotulo      TEXT NOT NULL,
  ajuda       TEXT NOT NULL DEFAULT '',
  tipo        TEXT NOT NULL DEFAULT 'texto',
  obrigatorio INTEGER NOT NULL DEFAULT 0,
  opcoes      JSONB NOT NULL DEFAULT '[]',
  ordem       INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT tipo_conhecido CHECK (
    tipo IN ('texto', 'longo', 'numero', 'data', 'sim_nao', 'escolha', 'multipla')
  )
);
CREATE INDEX idx_form_fields ON form_fields(tenant_id, form_id, ordem);

-- Qual serviço pede qual formulário. Um formulário serve vários serviços — a
-- mesma anamnese vale para toda a linha facial — e um serviço pode pedir mais
-- de um.
CREATE TABLE form_services (
  tenant_id  TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true),
  form_id    TEXT NOT NULL REFERENCES forms(id)    ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (form_id, service_id)
);
CREATE INDEX idx_form_services ON form_services(tenant_id, service_id);

CREATE TABLE form_answers (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true),
  form_id        TEXT NOT NULL REFERENCES forms(id),
  appointment_id TEXT REFERENCES appointments(id) ON DELETE CASCADE,
  client_id      TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- [{ rotulo, tipo, valor }] — rótulo congelado, ver o cabeçalho.
  respostas      JSONB NOT NULL DEFAULT '[]',
  criado_em      TEXT NOT NULL
);
CREATE INDEX idx_answers_appt   ON form_answers(tenant_id, appointment_id);
-- "O que ela respondeu da última vez" é a consulta que preenche o formulário de
-- novo sem obrigar a redigitar tudo.
CREATE INDEX idx_answers_client ON form_answers(tenant_id, client_id, criado_em DESC);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['forms', 'form_fields', 'form_services', 'form_answers'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY isolamento_por_empresa ON %I
        USING (tenant_id = current_setting('app.tenant_id', true))
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true))
    $f$, t);
  END LOOP;
END $$;

-- A resposta não se edita depois de dada: é o registro do que a cliente
-- declarou naquele dia, e reescrever isso apaga a razão de um procedimento ter
-- sido feito de um jeito. Corrigir é responder de novo. Mesma regra de `logs`,
-- e o mesmo cuidado: o ALTER DEFAULT PRIVILEGES da 002 já concedeu tudo, então
-- é preciso revogar em vez de conceder pouco.
REVOKE UPDATE ON form_answers FROM vital_app;
