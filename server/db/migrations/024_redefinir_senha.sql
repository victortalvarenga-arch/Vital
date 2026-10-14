-- 024 · "Esqueci minha senha": links de redefinição de uso único.
--
-- Até aqui, quem esquecia a senha dependia do dono redefinir pelo painel — e
-- o dono que esquecia a própria não tinha caminho nenhum.
--
-- Mesma regra de `sessoes`: guarda o HASH do token, nunca o token. O link vai
-- por e-mail e vale uma hora e uma vez; vazar esta tabela não serve para
-- trocar a senha de ninguém.
--
-- Com RLS, ao contrário de `sessoes`: o pedido chega pelo endereço da empresa,
-- então a conexão já sabe de quem é quando lê ou grava aqui.

CREATE TABLE redefinicoes_senha (
  token_hash TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true),
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  criada_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em  TIMESTAMPTZ NOT NULL,
  usada_em   TIMESTAMPTZ
);
CREATE INDEX idx_redefinicoes_user ON redefinicoes_senha(tenant_id, user_id);

ALTER TABLE redefinicoes_senha ENABLE ROW LEVEL SECURITY;
ALTER TABLE redefinicoes_senha FORCE ROW LEVEL SECURITY;
CREATE POLICY isolamento_por_empresa ON redefinicoes_senha
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
