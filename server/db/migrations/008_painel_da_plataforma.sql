-- 008 · O back-office da Vital: sessões próprias e números por empresa.
--
-- `plataforma.usuarios` e `plataforma.auditoria` já existem desde a 002, mas
-- nada os usava. Esta migration entrega o que faltava para eles servirem.
--
-- ---------------------------------------------------------------------------
-- Sessão da nossa equipe é OUTRA COISA
-- ---------------------------------------------------------------------------
-- `public.sessoes` referencia `public.users` e carrega um `tenant_id`: é sessão
-- de quem trabalha numa empresa-cliente. Reaproveitar a mesma tabela para a
-- nossa equipe faria as duas viverem no mesmo espaço de ids, e uma confusão de
-- consulta transformaria suporte em dono de empresa — ou o contrário.
--
-- Tabela separada, cookie de nome diferente, e nenhuma referência cruzada. As
-- duas sessões podem coexistir no mesmo navegador sem se enxergar.

CREATE TABLE plataforma.sessoes (
  -- O HASH do token, nunca o token. Mesma lógica de `public.sessoes`.
  token_hash TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES plataforma.usuarios(id) ON DELETE CASCADE,
  criada_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em  TIMESTAMPTZ NOT NULL,
  agente     TEXT DEFAULT ''
);
CREATE INDEX idx_plat_sessoes_usuario ON plataforma.sessoes(usuario_id);
CREATE INDEX idx_plat_sessoes_expira  ON plataforma.sessoes(expira_em);

-- ---------------------------------------------------------------------------
-- Números por empresa, sem furar o isolamento
-- ---------------------------------------------------------------------------
-- O back-office precisa saber quantos clientes e agendamentos cada empresa tem.
-- Só que a aplicação conecta como `vital_app`, que é barrado pelo RLS — e é
-- exatamente por isso que o isolamento funciona.
--
-- Contar empresa por empresa com `db.comEmpresa` daria certo e não escala: são
-- quatro consultas por empresa, cada uma numa conexão marcada. Com duzentas
-- empresas, é uma tela que faz oitocentas idas ao banco.
--
-- A saída é esta função. `SECURITY DEFINER` a faz rodar como o dono (postgres),
-- que ignora o RLS — e é por isso que ela devolve **só contagens**, nunca
-- linha. Um nome de cliente não sai daqui, nem por engano: não há coluna que o
-- carregue. `search_path` fixo impede que alguém plante um `public` falso.
CREATE FUNCTION plataforma.numeros_por_empresa()
RETURNS TABLE (
  tenant_id        TEXT,
  clientes         BIGINT,
  profissionais    BIGINT,
  servicos         BIGINT,
  agendamentos_mes BIGINT,
  ultimo_movimento TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT t.id,
         (SELECT count(*) FROM clients  c WHERE c.tenant_id = t.id),
         (SELECT count(*) FROM staff    s WHERE s.tenant_id = t.id AND s.ativo = 1),
         (SELECT count(*) FROM services v WHERE v.tenant_id = t.id AND v.ativo = 1),
         (SELECT count(*) FROM appointments a
           WHERE a.tenant_id = t.id
             AND a.data >= to_char(date_trunc('month', now()), 'YYYY-MM-DD')),
         (SELECT max(a.criado_em) FROM appointments a WHERE a.tenant_id = t.id)
    FROM plataforma.tenants t;
$$;

-- A função é do postgres e roda com os poderes dele; quem pode CHAMAR é só
-- `vital_app`. Revogar de PUBLIC primeiro, senão qualquer papel do banco
-- executa — inclusive um que venha a existir depois.
REVOKE ALL ON FUNCTION plataforma.numeros_por_empresa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plataforma.numeros_por_empresa() TO vital_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON plataforma.sessoes TO vital_app;
GRANT SELECT, INSERT, UPDATE ON plataforma.usuarios TO vital_app;
GRANT SELECT, INSERT ON plataforma.auditoria TO vital_app;
GRANT USAGE ON SEQUENCE plataforma.auditoria_id_seq TO vital_app;
