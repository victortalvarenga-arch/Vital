-- 004 · Login de verdade: sessões no banco.
--
-- Sessão em tabela, e não token assinado (JWT), por um motivo prático: a Vital
-- precisa conseguir **derrubar** um acesso. Suspender uma empresa que não pagou,
-- tirar uma funcionária demitida na hora, encerrar sessão de aparelho perdido.
-- Token assinado vale até expirar, aconteça o que acontecer; linha em tabela
-- some quando a gente apaga.
--
-- O custo é uma consulta por requisição. Barato, e indexada.

CREATE TABLE sessoes (
  -- Guarda o HASH do token, nunca o token. Se o banco vazar, o que está aqui
  -- não serve para entrar em lugar nenhum — mesma lógica da senha.
  token_hash TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  criada_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em  TIMESTAMPTZ NOT NULL,
  -- Só para a pessoa reconhecer as próprias sessões numa tela futura.
  agente     TEXT DEFAULT ''
);
CREATE INDEX idx_sessoes_user ON sessoes(user_id);
CREATE INDEX idx_sessoes_expira ON sessoes(expira_em);

-- Sem RLS: o login acontece ANTES de saber de qual empresa é a pessoa, então a
-- consulta que valida a sessão não tem `app.tenant_id` definido ainda. É a
-- própria linha que carrega o tenant_id e diz para qual empresa abrir a
-- conexão. Por isso o acesso a esta tabela é só por id de sessão, nunca por
-- varredura.
GRANT SELECT, INSERT, UPDATE, DELETE ON sessoes TO vital_app;

-- O papel 'dono' passa a ser o padrão de quem for criado primeiro; os demais
-- entram como 'funcionario'. A coluna já existia com esse default.
