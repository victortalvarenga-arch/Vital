-- 002 · Isolamento entre empresas com Row-Level Security.
--
-- A coluna `tenant_id` sozinha depende de alguém lembrar de escrever
-- `WHERE tenant_id = ...` em toda consulta. Esquecer uma vez, numa rota, é uma
-- empresa vendo a agenda da outra. Aqui a regra passa a ser do banco: cada
-- tabela ganha uma política que só devolve linha da empresa da conexão atual, e
-- consulta que esqueça o filtro simplesmente não vê nada demais.
--
-- Duas armadilhas do RLS, que definem o desenho abaixo:
--
--  1. Superusuário SEMPRE ignora RLS. Por isso a aplicação deixa de conectar
--     como `postgres` e passa a usar `vital_app`, sem superusuário.
--  2. O dono da tabela também ignora, a menos que a tabela use FORCE. Como as
--     tabelas pertencem a `postgres`, quem roda migration continua enxergando
--     tudo — o que é desejado —, e FORCE fecha o resto.
--
-- Migration roda com DATABASE_ADMIN_URL (postgres); a aplicação, com
-- DATABASE_URL (vital_app).

-- ---------------------------------------------------------------------------
-- Schema da plataforma: o que é nosso, não de nenhuma empresa-cliente
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS plataforma;

-- `tenants` sai de public: é cadastro da Vital, não dado de negócio de ninguém.
-- Fica sem RLS de propósito — quem lê é a plataforma.
ALTER TABLE public.tenants SET SCHEMA plataforma;

ALTER TABLE plataforma.tenants ADD COLUMN plano  TEXT NOT NULL DEFAULT 'gratuito';
ALTER TABLE plataforma.tenants ADD COLUMN status TEXT NOT NULL DEFAULT 'ativa';  -- ativa|suspensa|cancelada

-- Nossa equipe. Nada a ver com `public.users`, que é a equipe da empresa-cliente.
CREATE TABLE plataforma.usuarios (
  id           TEXT PRIMARY KEY,
  nome         TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  senha_hash   TEXT NOT NULL DEFAULT '',
  papel        TEXT NOT NULL DEFAULT 'suporte',   -- admin|suporte
  ativo        INTEGER NOT NULL DEFAULT 1,
  ultimo_login TEXT,
  criado_em    TEXT NOT NULL
);

-- Toda ação administrativa nossa fica registrada. Abrir o dado de uma empresa
-- para dar suporte é legítimo; fazer isso sem deixar rastro, não.
CREATE TABLE plataforma.auditoria (
  id         BIGSERIAL PRIMARY KEY,
  usuario_id TEXT REFERENCES plataforma.usuarios(id),
  tenant_id  TEXT REFERENCES plataforma.tenants(id),
  acao       TEXT NOT NULL,        -- suspender|reativar|abrir_suporte|...
  detalhe    JSONB DEFAULT '{}',
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_auditoria_tenant ON plataforma.auditoria(tenant_id, criado_em DESC);

-- ---------------------------------------------------------------------------
-- service_staff também precisa de dono
-- ---------------------------------------------------------------------------
-- Era a única tabela de negócio sem `tenant_id`. Guarda só pares de id, mas sem
-- política ela responderia "quais profissionais atendem quais serviços" para o
-- banco inteiro.
ALTER TABLE service_staff ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

-- ---------------------------------------------------------------------------
-- tenant_id passa a se preencher sozinho
-- ---------------------------------------------------------------------------
-- Com o default lendo a conexão, nenhum INSERT precisa informar a empresa — e
-- não dá para informar a errada por engano. Se a conexão não tiver empresa
-- definida, o valor vira NULL e o NOT NULL derruba a escrita: falha fechada,
-- que é o lado certo para errar.
ALTER TABLE staff         ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id', true);
ALTER TABLE services      ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id', true);
ALTER TABLE service_staff ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id', true);
ALTER TABLE clients       ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id', true);
ALTER TABLE appointments  ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id', true);
ALTER TABLE units         ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id', true);
ALTER TABLE blocks        ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id', true);
ALTER TABLE users         ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id', true);
ALTER TABLE templates     ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id', true);
ALTER TABLE messages      ALTER COLUMN tenant_id SET DEFAULT current_setting('app.tenant_id', true);

-- ---------------------------------------------------------------------------
-- Índices: tenant_id na frente
-- ---------------------------------------------------------------------------
-- Sem isto o RLS fica lento: a política entra como filtro em toda consulta, e
-- índice que não começa por tenant_id não serve para ela.
CREATE INDEX idx_appt_tenant_staff ON appointments(tenant_id, staff_id, data);
CREATE INDEX idx_clients_tenant    ON clients(tenant_id, nome);
CREATE INDEX idx_msg_tenant        ON messages(tenant_id, status, agendado_para);
CREATE INDEX idx_templates_tenant  ON templates(tenant_id, tipo);
CREATE INDEX idx_svcstaff_tenant   ON service_staff(tenant_id, service_id);

-- ---------------------------------------------------------------------------
-- As políticas
-- ---------------------------------------------------------------------------
-- USING filtra o que a consulta enxerga; WITH CHECK impede gravar linha de
-- outra empresa. Os dois são necessários: sem WITH CHECK, daria para inserir
-- dado no nome de terceiros mesmo sem conseguir lê-lo.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'staff','services','service_staff','clients','appointments',
    'units','blocks','users','templates','messages'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY isolamento_por_empresa ON %I
        USING (tenant_id = current_setting('app.tenant_id', true))
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true))
    $f$, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- O usuário da aplicação
-- ---------------------------------------------------------------------------
-- Sem senha aqui de propósito: migration vai para o Git. A senha é definida
-- fora, uma vez — em desenvolvimento pelo `npm run setup:db`, em produção pelo
-- cofre de variáveis do provedor.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vital_app') THEN
    CREATE ROLE vital_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO vital_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vital_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vital_app;

-- Da plataforma, a aplicação só enxerga a própria empresa: precisa da config e
-- do status, nada de `usuarios` nem `auditoria`.
GRANT USAGE ON SCHEMA plataforma TO vital_app;
GRANT SELECT, UPDATE ON plataforma.tenants TO vital_app;

-- schema_migrations é do processo de deploy, não da aplicação.
REVOKE ALL ON public.schema_migrations FROM vital_app;
