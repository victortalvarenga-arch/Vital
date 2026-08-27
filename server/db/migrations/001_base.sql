-- 001 · Esquema inicial, do tempo em que o sistema atendia um estúdio só.
-- Os PRAGMA saíram daqui: quem os aplica é db.js, na abertura do banco.
-- Datas sempre em texto ISO 'YYYY-MM-DD'; horas em 'HH:MM'. Sem timezone: o estúdio
-- opera num fuso só, e isso evita a classe inteira de bugs de UTC em agenda.

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL          -- JSON
);

CREATE TABLE IF NOT EXISTS staff (
  id        TEXT PRIMARY KEY,
  nome      TEXT NOT NULL,
  funcao    TEXT DEFAULT '',
  fone      TEXT DEFAULT '',
  cor       TEXT DEFAULT '#A32A4E',
  comissao  REAL DEFAULT 0,     -- percentual
  jornada   TEXT DEFAULT '{}',  -- JSON {"1":["09:00","19:00"], ...} chave = dia da semana 0=dom
  ativo     INTEGER DEFAULT 1,
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id        TEXT PRIMARY KEY,
  nome      TEXT NOT NULL,
  categoria TEXT DEFAULT 'Geral',
  descricao TEXT DEFAULT '',
  preco     REAL NOT NULL DEFAULT 0,
  duracao   INTEGER NOT NULL DEFAULT 60,   -- minutos
  intervalo INTEGER NOT NULL DEFAULT 0,    -- minutos de limpeza depois do atendimento
  ativo     INTEGER DEFAULT 1,
  ordem     INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS service_staff (
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  staff_id   TEXT NOT NULL REFERENCES staff(id)    ON DELETE CASCADE,
  PRIMARY KEY (service_id, staff_id)
);

CREATE TABLE IF NOT EXISTS clients (
  id         TEXT PRIMARY KEY,
  nome       TEXT NOT NULL,
  fone       TEXT NOT NULL UNIQUE,   -- só dígitos, com DDD, sem +55
  nascimento TEXT,                   -- 'YYYY-MM-DD'
  endereco   TEXT DEFAULT '',
  obs        TEXT DEFAULT '',
  optin      INTEGER DEFAULT 1,      -- aceita mensagens de marketing (LGPD)
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clients_fone ON clients(fone);

CREATE TABLE IF NOT EXISTS appointments (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL REFERENCES clients(id),
  service_id  TEXT NOT NULL REFERENCES services(id),
  staff_id    TEXT NOT NULL REFERENCES staff(id),
  data        TEXT NOT NULL,   -- 'YYYY-MM-DD'
  hora        TEXT NOT NULL,   -- 'HH:MM'
  duracao     INTEGER NOT NULL,
  valor       REAL NOT NULL,
  status      TEXT NOT NULL DEFAULT 'agendado', -- agendado|confirmado|concluido|falta|cancelado
  pag_status  TEXT NOT NULL DEFAULT 'aberto',   -- aberto|pago|estornado
  pag_forma   TEXT DEFAULT 'local',             -- pix|cartao|dinheiro|local
  pag_ref     TEXT DEFAULT '',                  -- id da cobrança no gateway
  origem      TEXT DEFAULT 'site',              -- site|painel
  obs         TEXT DEFAULT '',
  criado_em   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appt_data  ON appointments(data);
CREATE INDEX IF NOT EXISTS idx_appt_staff ON appointments(staff_id, data);

CREATE TABLE IF NOT EXISTS templates (
  id     TEXT PRIMARY KEY,
  chave  TEXT NOT NULL UNIQUE,  -- confirmacao|lembrete_vespera|...
  titulo TEXT NOT NULL,
  quando TEXT DEFAULT '',
  tipo   TEXT NOT NULL DEFAULT 'auto',  -- auto|campanha
  ativo  INTEGER DEFAULT 1,
  texto  TEXT NOT NULL,
  meta_template_name TEXT DEFAULT ''    -- nome do template aprovado na Meta
);

-- Fila de mensagens. Toda mensagem passa por aqui, mesmo no modo manual.
CREATE TABLE IF NOT EXISTS messages (
  id             TEXT PRIMARY KEY,
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
CREATE INDEX IF NOT EXISTS idx_msg_status ON messages(status, agendado_para);
