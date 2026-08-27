-- 001 · Esquema inicial em PostgreSQL.
--
-- Consolida o que antes eram duas migrations de SQLite. Como ainda não existia
-- dado real, não fazia sentido carregar o histórico do motor antigo — inclusive
-- porque metade dele era reconstrução de tabela, coisa que só o SQLite exigia.
--
-- Datas e horas são TEXT de propósito: 'YYYY-MM-DD' e 'HH:MM'. O negócio opera
-- num fuso só, e guardar como timestamp com fuso é o caminho mais curto para a
-- agenda virar o dia sozinha. O porquê está em ARQUITETURA.md.
--
-- Dinheiro é NUMERIC, nunca float: 0.1 + 0.2 em ponto flutuante não dá 0.3, e
-- isso vira centavo errado em comissão e fechamento de caixa.

-- ---------------------------------------------------------------------------
-- Empresas
-- ---------------------------------------------------------------------------
CREATE TABLE tenants (
  id        TEXT PRIMARY KEY,
  slug      TEXT NOT NULL UNIQUE,        -- vira subdomínio quando o Bloco 9 chegar
  nome      TEXT NOT NULL,
  dominio   TEXT DEFAULT '',
  config    JSONB NOT NULL DEFAULT '{}', -- marca, textos, vocabulário, exibição
  ativo     INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL
);

INSERT INTO tenants (id, slug, nome, config, ativo, criado_em)
VALUES ('default', 'default', 'Meu negócio', '{}', 1, to_char(now(), 'YYYY-MM-DD'));

-- Configuração da plataforma inteira, não de uma empresa.
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Unidades
-- ---------------------------------------------------------------------------
CREATE TABLE units (
  id        TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  nome      TEXT NOT NULL,
  endereco  TEXT DEFAULT '',
  fone      TEXT DEFAULT '',
  mapa      TEXT DEFAULT '',
  jornada   JSONB DEFAULT '{}',
  ordem     INTEGER DEFAULT 0,
  ativo     INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL
);
CREATE INDEX idx_units_tenant ON units(tenant_id, ativo);

-- ---------------------------------------------------------------------------
-- Equipe
-- ---------------------------------------------------------------------------
CREATE TABLE staff (
  id        TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  unit_id   TEXT REFERENCES units(id),
  nome      TEXT NOT NULL,
  funcao    TEXT DEFAULT '',
  fone      TEXT DEFAULT '',
  cor       TEXT DEFAULT '#A32A4E',
  comissao  NUMERIC(5,2) DEFAULT 0,      -- percentual
  jornada   JSONB DEFAULT '{}',          -- {"1":["09:00","19:00"]} · chave = dia da semana, 0=dom
  ativo     INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL
);
CREATE INDEX idx_staff_tenant ON staff(tenant_id, ativo);

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------
CREATE TABLE services (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL DEFAULT 'default',
  nome          TEXT NOT NULL,
  categoria     TEXT DEFAULT 'Geral',
  descricao     TEXT DEFAULT '',
  preco         NUMERIC(10,2) NOT NULL DEFAULT 0,
  duracao       INTEGER NOT NULL DEFAULT 60,   -- minutos
  intervalo     INTEGER NOT NULL DEFAULT 0,    -- minutos de limpeza depois do atendimento
  foto          TEXT DEFAULT '',
  mostrar_preco INTEGER NOT NULL DEFAULT 1,    -- desligado = "sob consulta"
  ativo         INTEGER NOT NULL DEFAULT 1,
  ordem         INTEGER DEFAULT 0
);
CREATE INDEX idx_services_tenant ON services(tenant_id, ativo);

CREATE TABLE service_staff (
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  staff_id   TEXT NOT NULL REFERENCES staff(id)    ON DELETE CASCADE,
  PRIMARY KEY (service_id, staff_id)
);

-- ---------------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------------
-- O telefone é único por empresa, não no banco inteiro: a mesma pessoa pode ser
-- cliente de dois negócios que usam a plataforma.
CREATE TABLE clients (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL DEFAULT 'default',
  nome       TEXT NOT NULL,
  fone       TEXT NOT NULL,          -- só dígitos, com DDD, sem +55
  nascimento TEXT,                   -- 'YYYY-MM-DD'
  endereco   TEXT DEFAULT '',
  obs        TEXT DEFAULT '',
  email      TEXT DEFAULT '',
  google_sub TEXT,                   -- id da conta Google (Bloco 5)
  optin      INTEGER NOT NULL DEFAULT 1,   -- aceita marketing (LGPD)
  criado_em  TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_clients_fone ON clients(tenant_id, fone);
CREATE UNIQUE INDEX idx_clients_google ON clients(google_sub) WHERE google_sub IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Agenda
-- ---------------------------------------------------------------------------
CREATE TABLE appointments (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL DEFAULT 'default',
  client_id   TEXT NOT NULL REFERENCES clients(id),
  service_id  TEXT NOT NULL REFERENCES services(id),
  staff_id    TEXT NOT NULL REFERENCES staff(id),
  unit_id     TEXT REFERENCES units(id),
  data        TEXT NOT NULL,   -- 'YYYY-MM-DD'
  hora        TEXT NOT NULL,   -- 'HH:MM'
  duracao     INTEGER NOT NULL,
  valor       NUMERIC(10,2) NOT NULL,
  status      TEXT NOT NULL DEFAULT 'agendado', -- agendado|confirmado|concluido|falta|cancelado
  pag_status  TEXT NOT NULL DEFAULT 'aberto',   -- aberto|pago|estornado
  pag_forma   TEXT DEFAULT 'local',             -- pix|cartao|dinheiro|local
  pag_ref     TEXT DEFAULT '',                  -- id da cobrança no gateway
  origem      TEXT DEFAULT 'site',              -- site|painel
  obs         TEXT DEFAULT '',
  criado_em   TEXT NOT NULL
);
CREATE INDEX idx_appt_tenant ON appointments(tenant_id, data);
CREATE INDEX idx_appt_staff  ON appointments(staff_id, data);

-- Almoço, folga, feriado. staff_id nulo = fecha para a equipe toda.
-- É o segundo lugar, junto da jornada, que o motor de horários consulta.
CREATE TABLE blocks (
  id        TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  staff_id  TEXT REFERENCES staff(id) ON DELETE CASCADE,
  unit_id   TEXT REFERENCES units(id),
  data      TEXT NOT NULL,          -- 'YYYY-MM-DD'
  hora_ini  TEXT NOT NULL,          -- 'HH:MM'
  hora_fim  TEXT NOT NULL,          -- 'HH:MM'
  motivo    TEXT DEFAULT '',
  criado_em TEXT NOT NULL
);
CREATE INDEX idx_blocks_data  ON blocks(tenant_id, data);
CREATE INDEX idx_blocks_staff ON blocks(staff_id, data);

-- ---------------------------------------------------------------------------
-- Usuários do painel
-- ---------------------------------------------------------------------------
-- Senha é hash argon2, nunca a senha. staff_id liga o login à pessoa da agenda,
-- para o funcionário ver a própria agenda sem ver o financeiro do negócio.
-- Quem passa a usar esta tabela é o Bloco 3.
CREATE TABLE users (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL DEFAULT 'default',
  staff_id     TEXT REFERENCES staff(id),
  nome         TEXT NOT NULL,
  email        TEXT NOT NULL,
  senha_hash   TEXT NOT NULL DEFAULT '',
  papel        TEXT NOT NULL DEFAULT 'funcionario',  -- dono|gerente|funcionario
  ativo        INTEGER NOT NULL DEFAULT 1,
  ultimo_login TEXT,
  criado_em    TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_users_email ON users(tenant_id, email);

-- ---------------------------------------------------------------------------
-- Mensagens
-- ---------------------------------------------------------------------------
CREATE TABLE templates (
  id        TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  chave     TEXT NOT NULL,           -- confirmacao|lembrete_vespera|...
  titulo    TEXT NOT NULL,
  quando    TEXT DEFAULT '',
  tipo      TEXT NOT NULL DEFAULT 'auto',  -- auto|campanha
  ativo     INTEGER NOT NULL DEFAULT 1,
  texto     TEXT NOT NULL,
  meta_template_name TEXT DEFAULT ''  -- nome do template aprovado na Meta
);
CREATE UNIQUE INDEX idx_templates_chave ON templates(tenant_id, chave);

-- Toda mensagem passa por aqui, mesmo no modo manual: dá para revisar antes de
-- disparar, e nada se perde se a API da Meta cair no meio.
CREATE TABLE messages (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL DEFAULT 'default',
  client_id      TEXT REFERENCES clients(id),
  appointment_id TEXT REFERENCES appointments(id) ON DELETE CASCADE,
  template_chave TEXT NOT NULL,
  fone           TEXT NOT NULL,
  texto          TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pendente', -- pendente|enviado|erro|pulado
  agendado_para  TEXT NOT NULL,   -- 'YYYY-MM-DD HH:MM'
  enviado_em     TEXT,
  provider       TEXT DEFAULT '',
  provider_id    TEXT DEFAULT '',
  erro           TEXT DEFAULT '',
  dedupe_key     TEXT UNIQUE,     -- evita disparar a mesma coisa duas vezes
  criado_em      TEXT NOT NULL
);
CREATE INDEX idx_msg_status ON messages(status, agendado_para);
