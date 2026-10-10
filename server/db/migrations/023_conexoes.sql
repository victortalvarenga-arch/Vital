-- 023 · Contas externas que a empresa conecta ao site: Google e Instagram.
--
-- A dona clica em "Conectar" no painel, autoriza na tela do Google ou da Meta,
-- e daí em diante um job traz as avaliações e as publicações sozinho. O que
-- essa autorização devolve é um token — e token é segredo: quem o tem lê (e no
-- Google, edita) a ficha da empresa.
--
-- Por isso tabela própria, e não `tenants.config`:
--
--   - a config sai inteira em `GET /api/config` para qualquer papel do painel,
--     e a vitrine pública é montada a partir dela. Um campo de token ali estaria
--     a um descuido de ir para a internet;
--   - `plataforma.tenants` não tem RLS. Aqui, como em toda tabela de negócio, o
--     banco recusa sozinho a linha de outra empresa.
--
-- Os tokens chegam cifrados (AES-256-GCM, chave em CONEXOES_SEGREDO — ver
-- `lib/segredo.js`). Um dump do banco sozinho não abre a ficha de ninguém.
--
-- `expira_em` é TIMESTAMPTZ, contra a regra de "data é texto" do projeto: a
-- regra existe para a agenda, que vive no fuso da empresa. Validade de token é
-- instante absoluto vindo de fora (`expires_in` em segundos), e compará-la com
-- now() no fuso errado renovaria cedo ou tarde demais.

CREATE TABLE conexoes (
  tenant_id       TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true),
  provedor        TEXT NOT NULL CHECK (provedor IN ('google', 'instagram')),
  token_acesso    TEXT NOT NULL,
  token_renovacao TEXT,                  -- só o Google devolve; a Meta renova o próprio
  expira_em       TIMESTAMPTZ,
  renovado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- O que a tela mostra: "@perfil" ou o nome da ficha no Google. Não é segredo.
  conta           TEXT NOT NULL DEFAULT '',
  -- Sobra de cada provedor: no Google, a conta, a lista de fichas e qual foi
  -- escolhida. Nunca token.
  extra           JSONB NOT NULL DEFAULT '{}',
  -- 'ok' | 'escolher' (Google com mais de uma ficha) | 'erro'
  situacao        TEXT NOT NULL DEFAULT 'ok',
  ultimo_erro     TEXT NOT NULL DEFAULT '',
  sincronizado_em TIMESTAMPTZ,
  conectado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  conectado_por   TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (tenant_id, provedor)
);

ALTER TABLE conexoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE conexoes FORCE ROW LEVEL SECURITY;
CREATE POLICY isolamento_por_empresa ON conexoes
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
