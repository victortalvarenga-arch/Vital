-- 014 · Suporte: a empresa-cliente fala com a Vital de dentro do produto.
--
-- ---------------------------------------------------------------------------
-- Por que em `plataforma`, e não em `public`
-- ---------------------------------------------------------------------------
-- Todo o resto do que uma empresa cria — cliente, agendamento, serviço — mora
-- em `public`, com Row-Level Security. Chamado de suporte não: ele não é dado
-- do negócio dela, é uma conversa ENTRE ela e a Vital. Quem precisa ler é a
-- nossa equipe, atravessando todas as empresas, que é exatamente o que o RLS
-- existe para impedir.
--
-- Pôr em `public` obrigaria o back-office a furar o RLS para ler — e o
-- CLAUDE.md é explícito: rota de `/api/plataforma` não devolve linha de tabela
-- de negócio. A saída limpa é o chamado nascer fora do território do RLS, como
-- `plataforma.tenants` e `plataforma.auditoria` já são.
--
-- ---------------------------------------------------------------------------
-- O preço disso, e como se paga
-- ---------------------------------------------------------------------------
-- Sem RLS, errar a empresa numa consulta PASSA CALADO — é o mesmo risco que o
-- CLAUDE.md registra para `plataforma.tenants`. E não adianta esperar que o
-- banco separe: painel e back-office atendem pela MESMA conexão, `vital_app`.
-- Quem separa é a rota, exatamente como já acontece com `plataforma.tenants`
-- (o papel tem UPDATE lá, e só as rotas de `/api/plataforma` o usam).
--
-- Então a garantia é de código, e precisa ser testada como tal:
--
--   * a rota do painel filtra por `empresaAtual()` SEMPRE, e nunca aceita
--     `tenantId` vindo do corpo da requisição;
--   * responder e fechar vive atrás de `exigeVital`, no back-office;
--   * DELETE não é concedido a ninguém: chamado é histórico, não some.
--
-- ---------------------------------------------------------------------------
-- O nome de quem abriu fica congelado
-- ---------------------------------------------------------------------------
-- Mesma razão de `logs` (migration 010): acesso se apaga, e o chamado precisa
-- continuar dizendo quem pediu. Guardar só o id transformaria o histórico em
-- "alguém" no dia da demissão.

CREATE TABLE plataforma.tickets (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES plataforma.tenants(id) ON DELETE CASCADE,
  autor_nome   TEXT NOT NULL DEFAULT '',   -- congelado, ver acima
  autor_email  TEXT NOT NULL DEFAULT '',
  assunto      TEXT NOT NULL,
  mensagem     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'aberto',   -- aberto | respondido | fechado
  resposta     TEXT NOT NULL DEFAULT '',
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  respondido_em TIMESTAMPTZ
);

-- A empresa lê os próprios, em ordem; a Vital lê a fila inteira pela data.
CREATE INDEX idx_tickets_empresa ON plataforma.tickets(tenant_id, criado_em DESC);
CREATE INDEX idx_tickets_abertos ON plataforma.tickets(criado_em DESC) WHERE status <> 'fechado';

-- Sem DELETE, de propósito: chamado é histórico. As três operações que existem
-- são abrir (empresa), acompanhar (empresa) e responder (Vital).
GRANT SELECT, INSERT, UPDATE ON plataforma.tickets TO vital_app;
