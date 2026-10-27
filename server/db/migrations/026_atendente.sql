-- 026 · Conversas do atendente por IA (Bloco 12).
--
-- Uma conversa é um número de WhatsApp falando com a clínica — ou, no canal
-- 'teste', alguém da equipe experimentando o atendente pelo painel. A conversa
-- está com a IA ou com a equipe (`estado`); quando a IA passa a vez, ela não
-- responde mais até alguém devolver.
--
-- As mensagens guardam o texto, porque a equipe precisa ler a conversa para
-- assumir. É a mesma classe de dado da tabela `messages` (o que a clínica
-- mandou a quem), e fica aqui, com RLS, e nunca no log: o log do atendente só
-- leva ids, contagens e códigos de regra.
--
-- `revisao` é o que a revisão encontrou (`atendente/saida.js`): códigos de
-- regra, quantas tentativas, se saiu o texto de reserva. Nunca o texto
-- reprovado — a resposta barrada é justamente o que não deve ficar circulando.
--
-- Instantes em TIMESTAMPTZ, contra a regra de "data é texto": a regra é da
-- agenda, que vive no fuso da empresa. Aqui a coluna só ordena mensagens, e
-- `clock_timestamp()` separa duas gravadas na mesma transação — `now()` daria
-- o mesmo instante para a pergunta e a resposta.

CREATE TABLE conversas (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true),
  canal         TEXT NOT NULL CHECK (canal IN ('whatsapp', 'teste')),
  fone          TEXT NOT NULL DEFAULT '',          -- só dígitos, sem +55
  estado        TEXT NOT NULL DEFAULT 'ia' CHECK (estado IN ('ia', 'equipe')),
  -- Código do motivo da passagem (E01…E05, ver `saida.js`), para a fila da
  -- equipe mostrar por que a conversa chegou até ela.
  motivo        TEXT NOT NULL DEFAULT '',
  criado_por    TEXT NOT NULL DEFAULT '',          -- no canal 'teste', quem abriu
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX conversas_por_fone ON conversas (tenant_id, canal, fone);

CREATE TABLE conversa_mensagens (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true),
  conversa_id TEXT NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
  autor       TEXT NOT NULL CHECK (autor IN ('cliente', 'ia', 'equipe')),
  texto       TEXT NOT NULL,
  -- 'sugerida': modo sombra, esperando a equipe aprovar; 'descartada': a
  -- equipe recusou e a mensagem não conta mais como dita.
  status      TEXT NOT NULL DEFAULT 'enviada' CHECK (status IN ('sugerida', 'enviada', 'descartada')),
  revisao     JSONB NOT NULL DEFAULT '{}',
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX conversa_mensagens_ordem ON conversa_mensagens (conversa_id, criado_em);

ALTER TABLE conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversas FORCE ROW LEVEL SECURITY;
CREATE POLICY isolamento_por_empresa ON conversas
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE conversa_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversa_mensagens FORCE ROW LEVEL SECURITY;
CREATE POLICY isolamento_por_empresa ON conversa_mensagens
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
