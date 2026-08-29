-- 010 · O que aconteceu no painel, e quem fez.
--
-- A plataforma tem `plataforma.auditoria` desde o Bloco 2 e ela provou o
-- desenho. A empresa-cliente não tinha nada: com funcionários no painel, botão
-- de excluir e agora arrastar para remarcar, "sumiu um agendamento e ninguém
-- sabe" é questão de tempo — e a resposta hoje seria "não dá para saber".
--
-- ---------------------------------------------------------------------------
-- O nome de quem fez fica congelado
-- ---------------------------------------------------------------------------
-- `user_id` referencia `users`, mas o nome vai copiado. Acesso se apaga —
-- funcionária que sai perde o login —, e o registro precisa continuar dizendo
-- quem cancelou aquele horário. Guardar só o id transformaria o histórico em
-- "alguém" no dia da demissão, que é justamente quando ele importa.
--
-- ---------------------------------------------------------------------------
-- Não se registra tudo
-- ---------------------------------------------------------------------------
-- Middleware que grava toda requisição de escrita seria mais fácil e daria um
-- registro pior: o painel chama `POST /api/mensagens/gerar-fila` a cada
-- carregamento, e a lista útil afogaria em ruído. Quem chama é a rota, no
-- ponto em que sabe o que mudou e consegue escrever uma frase que uma pessoa
-- entende. Ver `lib/registro.js`.

CREATE TABLE logs (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true),
  user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  usuario_nome TEXT NOT NULL DEFAULT '',   -- congelado, ver acima
  acao         TEXT NOT NULL,              -- 'agendamento.cancelado'
  alvo_tipo    TEXT NOT NULL DEFAULT '',   -- 'agendamento' | 'cliente' | 'servico' | ...
  alvo_id      TEXT NOT NULL DEFAULT '',
  resumo       TEXT NOT NULL DEFAULT '',   -- a frase que a pessoa lê
  detalhe      JSONB NOT NULL DEFAULT '{}',
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- tenant_id na frente, como as demais: a política do RLS entra como filtro em
-- toda consulta, e índice que não começa por ele não serve para ela.
CREATE INDEX idx_logs_tenant ON logs(tenant_id, criado_em DESC);
-- Funcionário vê o próprio rastro; este índice é o dessa leitura.
CREATE INDEX idx_logs_usuario ON logs(tenant_id, user_id, criado_em DESC);
-- "O que aconteceu com o agendamento da Maria" é a pergunta que se faz olhando
-- a ficha, e ela chega pelo alvo.
CREATE INDEX idx_logs_alvo ON logs(tenant_id, alvo_tipo, alvo_id, criado_em DESC);

ALTER TABLE logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs FORCE ROW LEVEL SECURITY;
CREATE POLICY isolamento_por_empresa ON logs
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Sem UPDATE nem DELETE: registro que se edita não é registro. Apagar o
-- histórico de uma empresa é operação de plataforma, com a credencial de
-- administrador, não coisa que a aplicação faça.
GRANT SELECT, INSERT ON logs TO vital_app;
GRANT USAGE ON SEQUENCE logs_id_seq TO vital_app;
