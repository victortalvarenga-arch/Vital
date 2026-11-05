-- 031 · O agendamento passa a ter história, e não só o estado de agora.
--
-- `appointments` guarda uma linha por atendimento e a reescreve a cada mudança:
-- cancelar sobrescreve o status, remarcar sobrescreve data e hora, apagar some
-- com tudo. O que sobrava do caminho era `logs` — frase para gente ler, gravada
-- só quando a rota lembrava, com o site e o fechamento automático de fora, e
-- podada em dois anos. Não dá para perguntar ali "com quanta antecedência ela
-- costuma cancelar?" nem "quantas faltas foram marcadas por alguém, e quantas o
-- sistema presumiu como comparecimento?".
--
-- ---------------------------------------------------------------------------
-- Por gatilho, e não na rota
-- ---------------------------------------------------------------------------
-- Um agendamento muda pelo painel, pelo site, pelo atendente do WhatsApp, pelo
-- fechamento automático, pelo cancelamento do combo que arrasta os irmãos e
-- pelo seed. Mesmo motivo da 025: lembrar de gravar em cada caminho é a forma
-- garantida de esquecer um — e foi exatamente o que aconteceu com `logs`.
--
-- ---------------------------------------------------------------------------
-- Quem fez
-- ---------------------------------------------------------------------------
-- O gatilho não sabe quem está do outro lado; a aplicação conta, marcando a
-- transação com `app.autor_tipo`, `app.autor_id`, `app.autor_nome` e
-- `app.origem` (`db.comAutoria`, em db.js). Sem marca nenhuma, quem fez foi o
-- sistema — é o caso do cron e do seed, e é o lado certo para errar: atribuir
-- a uma pessoa o que ela não fez seria pior do que não saber.
--
--   equipe  → alguém logado no painel (autor_id = users.id, nome congelado)
--   cliente → o site ou o WhatsApp; quem é já está em `client_id`
--   sistema → o relógio: fechamento automático, seed, migration
--
-- ---------------------------------------------------------------------------
-- Sem chave estrangeira, de propósito
-- ---------------------------------------------------------------------------
-- O histórico precisa sobreviver ao agendamento: apagar é justamente o evento
-- que mais precisa de rastro. Por isso `appointment_id` não referencia nada, e
-- o evento 'apagado' leva a foto do que existia.
--
-- `tenant_id` é copiado da própria linha, e não lido da conexão como no resto:
-- uma migration futura que faça UPDATE em `appointments` roda como o dono do
-- banco, sem empresa marcada, e o default daria NULL e derrubaria a migration.

CREATE TABLE appointment_events (
  id             BIGSERIAL PRIMARY KEY,
  tenant_id      TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true),
  appointment_id TEXT NOT NULL,
  client_id      TEXT NOT NULL,
  evento         TEXT NOT NULL CHECK (evento IN ('criado', 'alterado', 'apagado')),
  -- Antes e depois só do que define o atendimento. Pagamento continua em
  -- `logs`: é dinheiro, não percurso, e tem regra própria de leitura.
  status_antes   TEXT,
  status_depois  TEXT,
  data_antes     TEXT,
  data_depois    TEXT,
  hora_antes     TEXT,
  hora_depois    TEXT,
  staff_antes    TEXT,
  staff_depois   TEXT,
  service_antes  TEXT,
  service_depois TEXT,
  autor_tipo     TEXT NOT NULL CHECK (autor_tipo IN ('equipe', 'cliente', 'sistema')),
  autor_id       TEXT NOT NULL DEFAULT '',
  autor_nome     TEXT NOT NULL DEFAULT '',
  -- painel | site | whatsapp | fechamento | ... — por onde a mudança entrou.
  origem         TEXT NOT NULL DEFAULT '',
  -- Instante absoluto, como `logs`: é o que mede antecedência de cancelamento
  -- contra `data`/`hora` do atendimento. clock_timestamp() separa dois eventos
  -- da mesma transação (criar e já cancelar o irmão do combo).
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- "Tudo o que aconteceu com este atendimento" e "tudo desta cliente" são as
-- duas leituras; tenant_id na frente, como os demais, por causa do RLS.
CREATE INDEX idx_appt_events_appt    ON appointment_events(tenant_id, appointment_id, criado_em);
CREATE INDEX idx_appt_events_cliente ON appointment_events(tenant_id, client_id, criado_em);

ALTER TABLE appointment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_events FORCE ROW LEVEL SECURITY;
CREATE POLICY isolamento_por_empresa ON appointment_events
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Tabela que só registra: sem este REVOKE ela nasceria com os quatro verbos,
-- pelo ALTER DEFAULT PRIVILEGES da 002 (a armadilha que a 011 documenta).
REVOKE UPDATE, DELETE ON appointment_events FROM vital_app;
-- O gatilho roda como quem fez a mudança (`vital_app`), e o BIGSERIAL precisa
-- da sequência — o default de privilégios da 002 cobre tabela, não sequência.
GRANT USAGE ON SEQUENCE appointment_events_id_seq TO vital_app;

CREATE FUNCTION registrar_evento_do_agendamento() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  tipo   TEXT := NULLIF(current_setting('app.autor_tipo', true), '');
  autor  TEXT := COALESCE(current_setting('app.autor_id', true), '');
  nome   TEXT := COALESCE(current_setting('app.autor_nome', true), '');
  origem TEXT := COALESCE(current_setting('app.origem', true), '');
BEGIN
  IF tipo IS NULL OR tipo NOT IN ('equipe', 'cliente', 'sistema') THEN
    tipo := 'sistema';
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO appointment_events (tenant_id, appointment_id, client_id, evento,
        status_depois, data_depois, hora_depois, staff_depois, service_depois,
        autor_tipo, autor_id, autor_nome, origem)
    VALUES (NEW.tenant_id, NEW.id, NEW.client_id, 'criado',
        NEW.status, NEW.data, NEW.hora, NEW.staff_id, NEW.service_id,
        tipo, autor, nome, COALESCE(NULLIF(origem, ''), NEW.origem, ''));
    RETURN NULL;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO appointment_events (tenant_id, appointment_id, client_id, evento,
        status_antes, data_antes, hora_antes, staff_antes, service_antes,
        autor_tipo, autor_id, autor_nome, origem)
    VALUES (OLD.tenant_id, OLD.id, OLD.client_id, 'apagado',
        OLD.status, OLD.data, OLD.hora, OLD.staff_id, OLD.service_id,
        tipo, autor, nome, origem);
    RETURN NULL;
  END IF;

  -- UPDATE: só vira evento se mudou o que define o atendimento. Receber um
  -- pagamento ou editar a observação não é percurso — e gravar tudo afogaria
  -- a pergunta útil, como o middleware que a 010 recusou.
  IF NEW.status     IS DISTINCT FROM OLD.status
  OR NEW.data       IS DISTINCT FROM OLD.data
  OR NEW.hora       IS DISTINCT FROM OLD.hora
  OR NEW.staff_id   IS DISTINCT FROM OLD.staff_id
  OR NEW.service_id IS DISTINCT FROM OLD.service_id THEN
    INSERT INTO appointment_events (tenant_id, appointment_id, client_id, evento,
        status_antes, status_depois, data_antes, data_depois, hora_antes, hora_depois,
        staff_antes, staff_depois, service_antes, service_depois,
        autor_tipo, autor_id, autor_nome, origem)
    VALUES (NEW.tenant_id, NEW.id, NEW.client_id, 'alterado',
        OLD.status, NEW.status, OLD.data, NEW.data, OLD.hora, NEW.hora,
        OLD.staff_id, NEW.staff_id, OLD.service_id, NEW.service_id,
        tipo, autor, nome, origem);
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER registrar_evento_do_agendamento
  AFTER INSERT OR UPDATE OR DELETE ON appointments
  FOR EACH ROW EXECUTE FUNCTION registrar_evento_do_agendamento();

-- O que já existe não ganha evento 'criado' inventado: a história começa aqui.
-- `criado_em` de cada agendamento continua dizendo quando ele nasceu.
