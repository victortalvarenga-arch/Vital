-- 002 · Fundação para atender mais de uma empresa.
--
-- Duas coisas acontecem aqui. A primeira é acrescentar 'tenant_id' em tudo que é
-- dado de negócio, para que o dia de virar multiempresa seja configuração e não
-- migração de dados. A segunda é criar o que faltava para operar de verdade:
-- unidades, bloqueio de horário e usuários com senha.
--
-- Enquanto for um deploy por empresa, todo mundo é o tenant 'default'.

-- ---------------------------------------------------------------------------
-- Empresas
-- ---------------------------------------------------------------------------
-- A config deixa de morar em 'settings' e passa a morar aqui: cada empresa tem
-- a sua. 'settings' continua existindo para o que for da plataforma inteira.
CREATE TABLE IF NOT EXISTS tenants (
  id        TEXT PRIMARY KEY,
  slug      TEXT NOT NULL UNIQUE,   -- vira subdomínio quando o Bloco 7 chegar
  nome      TEXT NOT NULL,
  dominio   TEXT DEFAULT '',        -- domínio próprio, se houver
  config    TEXT NOT NULL DEFAULT '{}',  -- JSON: marca, textos, vocabulário, exibição
  ativo     INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL
);

INSERT OR IGNORE INTO tenants (id, slug, nome, config, ativo, criado_em)
VALUES ('default', 'default', 'Meu negócio', '{}', 1, datetime('now'));

-- Leva a config que já existia para dentro da empresa padrão.
UPDATE tenants
   SET config = COALESCE((SELECT value FROM settings WHERE key = 'config'), '{}')
 WHERE id = 'default';
DELETE FROM settings WHERE key = 'config';

-- ---------------------------------------------------------------------------
-- Unidades
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS units (
  id        TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  nome      TEXT NOT NULL,
  endereco  TEXT DEFAULT '',
  fone      TEXT DEFAULT '',
  mapa      TEXT DEFAULT '',        -- link do mapa
  jornada   TEXT DEFAULT '{}',      -- JSON, mesmo formato de staff.jornada
  ordem     INTEGER DEFAULT 0,
  ativo     INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_units_tenant ON units(tenant_id, ativo);

-- ---------------------------------------------------------------------------
-- Bloqueio de horário
-- ---------------------------------------------------------------------------
-- Almoço, folga, feriado, atestado. staff_id nulo = fecha para a equipe toda.
-- É o segundo lugar, junto da jornada, que o motor de horários precisa olhar
-- antes de dizer que um horário está livre.
CREATE TABLE IF NOT EXISTS blocks (
  id        TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  staff_id  TEXT REFERENCES staff(id) ON DELETE CASCADE,
  unit_id   TEXT,
  data      TEXT NOT NULL,          -- 'YYYY-MM-DD'
  hora_ini  TEXT NOT NULL,          -- 'HH:MM'
  hora_fim  TEXT NOT NULL,          -- 'HH:MM'
  motivo    TEXT DEFAULT '',
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blocks_data ON blocks(tenant_id, data);
CREATE INDEX IF NOT EXISTS idx_blocks_staff ON blocks(staff_id, data);

-- ---------------------------------------------------------------------------
-- Usuários do painel
-- ---------------------------------------------------------------------------
-- A tabela nasce aqui; quem passa a usá-la é o Bloco 1. Senha é hash argon2 —
-- nunca a senha em si. staff_id liga o login à pessoa da agenda, para que um
-- profissional veja a própria agenda sem ver o financeiro do negócio.
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL DEFAULT 'default',
  nome       TEXT NOT NULL,
  email      TEXT NOT NULL,
  senha_hash TEXT NOT NULL DEFAULT '',
  papel      TEXT NOT NULL DEFAULT 'atendente',  -- dono|gerente|atendente
  staff_id   TEXT REFERENCES staff(id),
  ativo      INTEGER NOT NULL DEFAULT 1,
  ultimo_login TEXT,
  criado_em  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(tenant_id, email);

-- ---------------------------------------------------------------------------
-- tenant_id no que já existia
-- ---------------------------------------------------------------------------
-- Sem REFERENCES: o SQLite não aceita ADD COLUMN com chave estrangeira e
-- default não-nulo ao mesmo tempo. O vínculo é garantido no código, pelo
-- resolvedor em lib/tenant.js.
ALTER TABLE staff        ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE services     ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE appointments ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE messages     ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

-- Unidade onde a pessoa atende e onde o atendimento acontece.
ALTER TABLE staff        ADD COLUMN unit_id TEXT;
ALTER TABLE appointments ADD COLUMN unit_id TEXT;

-- Vitrine: foto do serviço e a opção de esconder o preço ("sob consulta").
ALTER TABLE services ADD COLUMN foto TEXT DEFAULT '';
ALTER TABLE services ADD COLUMN mostrar_preco INTEGER NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------------------
-- clients: reconstruída
-- ---------------------------------------------------------------------------
-- O telefone era UNIQUE global. Com duas empresas na mesma base, a mesma pessoa
-- pode ser cliente das duas — a unicidade tem de ser por empresa. Trocar isso
-- exige reconstruir a tabela; é barato agora e caro depois.
-- google_sub guarda o id do Google (Bloco 3); e-mail vem junto do login.
CREATE TABLE clients_novo (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL DEFAULT 'default',
  nome       TEXT NOT NULL,
  fone       TEXT NOT NULL,          -- só dígitos, com DDD, sem +55
  nascimento TEXT,                   -- 'YYYY-MM-DD'
  endereco   TEXT DEFAULT '',
  obs        TEXT DEFAULT '',
  email      TEXT DEFAULT '',
  google_sub TEXT,                   -- id da conta Google, quando houver
  optin      INTEGER DEFAULT 1,      -- aceita marketing (LGPD)
  criado_em  TEXT NOT NULL
);

INSERT INTO clients_novo (id, tenant_id, nome, fone, nascimento, endereco, obs, optin, criado_em)
SELECT id, 'default', nome, fone, nascimento, endereco, obs, optin, criado_em FROM clients;

DROP TABLE clients;
ALTER TABLE clients_novo RENAME TO clients;

CREATE UNIQUE INDEX idx_clients_fone ON clients(tenant_id, fone);
CREATE UNIQUE INDEX idx_clients_google ON clients(google_sub) WHERE google_sub IS NOT NULL;

-- ---------------------------------------------------------------------------
-- templates: reconstruída
-- ---------------------------------------------------------------------------
-- Mesma história: 'chave' era única no banco inteiro, e cada empresa precisa do
-- seu próprio conjunto de mensagens.
CREATE TABLE templates_novo (
  id        TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  chave     TEXT NOT NULL,           -- confirmacao|lembrete_vespera|...
  titulo    TEXT NOT NULL,
  quando    TEXT DEFAULT '',
  tipo      TEXT NOT NULL DEFAULT 'auto',  -- auto|campanha
  ativo     INTEGER DEFAULT 1,
  texto     TEXT NOT NULL,
  meta_template_name TEXT DEFAULT ''
);

INSERT INTO templates_novo (id, tenant_id, chave, titulo, quando, tipo, ativo, texto, meta_template_name)
SELECT id, 'default', chave, titulo, quando, tipo, ativo, texto, meta_template_name FROM templates;

DROP TABLE templates;
ALTER TABLE templates_novo RENAME TO templates;

CREATE UNIQUE INDEX idx_templates_chave ON templates(tenant_id, chave);

-- ---------------------------------------------------------------------------
-- Índices que passam a considerar a empresa
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_appt_tenant  ON appointments(tenant_id, data);
CREATE INDEX IF NOT EXISTS idx_staff_tenant ON staff(tenant_id, ativo);
CREATE INDEX IF NOT EXISTS idx_svc_tenant   ON services(tenant_id, ativo);
