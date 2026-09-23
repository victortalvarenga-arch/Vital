-- 015 · Onde as pessoas somem antes de marcar horário.
--
-- Até aqui o produto media **resultado** (quantos agendamentos, quanto faturou)
-- e nada de **percurso**. Com isso, toda conversa sobre a tela de agendamento
-- era opinião: ninguém sabia dizer se a pessoa desiste na escolha do serviço,
-- no calendário ou na hora de dar o WhatsApp. Cinco passos respondem isso:
--
--   site → agendamento → horário → confirmou → compareceu
--
-- ---------------------------------------------------------------------------
-- O que é uma linha aqui
-- ---------------------------------------------------------------------------
-- Uma **sessão** que chegou a um passo, não um clique. A chave primária é
-- (tenant_id, sessao, etapa), então a mesma visita gravando "abriu o
-- agendamento" cinco vezes continua valendo 1 — o `INSERT` usa
-- `ON CONFLICT DO NOTHING` e o banco faz a deduplicação, não a aplicação.
--
-- Isso também é o que limita o tamanho da tabela: no máximo quatro linhas por
-- visita, para sempre. Um evento por clique cresceria sem teto.
--
-- **A contagem é de sessões, não de agendamentos.** Quem marca dois horários na
-- mesma visita conta uma vez, e o `appointment_id` guardado é o do primeiro.
-- É o certo para medir queda entre telas, e é a razão de o número daqui não
-- bater com o total de agendamentos do mês — que é outra pergunta.
--
-- ---------------------------------------------------------------------------
-- Sem dado pessoal, de propósito
-- ---------------------------------------------------------------------------
-- `sessao` é um número aleatório que o navegador sorteia e esquece ao fechar a
-- aba. Não há IP, não há user-agent, não há nada que ligue a linha a uma
-- pessoa — e é por isso que isto não precisa de banner de consentimento nem
-- vira base de dado pessoal na LGPD. Quem for acrescentar coluna aqui:
-- contagem e percurso, nunca identificação.
--
-- O quinto passo, "compareceu", NÃO é evento: ele já existe em
-- `appointments.status`. Gravá-lo de novo criaria duas verdades sobre a mesma
-- coisa — o funil junta as duas por `appointment_id`.

CREATE TABLE funil (
  tenant_id TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true),
  -- Sorteado pelo navegador. 32 caracteres hexadecimais, conferidos na rota.
  sessao    TEXT NOT NULL,
  etapa     TEXT NOT NULL CHECK (etapa IN ('site', 'agendamento', 'horario', 'confirmou')),
  -- Texto 'YYYY-MM-DD', como toda data deste sistema (ver ARQUITETURA.md).
  data      TEXT NOT NULL,
  -- Só em 'confirmou': é o fio que liga o funil ao comparecimento.
  appointment_id TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, sessao, etapa)
);

-- A tela do back-office pergunta sempre "os últimos N dias, por empresa".
CREATE INDEX idx_funil_empresa_data ON funil(tenant_id, data);

ALTER TABLE funil ENABLE ROW LEVEL SECURITY;
ALTER TABLE funil FORCE ROW LEVEL SECURITY;
CREATE POLICY isolamento_por_empresa ON funil
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Tabela que só cresce, como `logs`: a aplicação insere e lê, e nunca reescreve
-- nem apaga. Sem este REVOKE ela nasceria com os quatro verbos, por causa do
-- ALTER DEFAULT PRIVILEGES da 002 — a armadilha que a 011 documenta. Podar o
-- histórico é operação de plataforma, com a credencial de administrador.
REVOKE UPDATE, DELETE ON funil FROM vital_app;

-- ---------------------------------------------------------------------------
-- O funil no back-office, sem furar o isolamento
-- ---------------------------------------------------------------------------
-- Mesmo acordo de `plataforma.numeros_por_empresa()` (migration 008): roda como
-- o dono para atravessar o RLS, e por isso devolve **só contagens**. Não há
-- coluna aqui capaz de carregar o nome, o telefone ou o horário de ninguém —
-- e é isso que mantém o isolamento de pé dentro da nossa própria tela.
--
-- `compareceu` é o join com `appointments`: das sessões que confirmaram, as que
-- terminaram em atendimento concluído. Cancelado e faltou não entram, que é o
-- ponto — o funil tem de mostrar quem sumiu DEPOIS de marcar também.
CREATE FUNCTION plataforma.funil_por_empresa(dias INT DEFAULT 30)
RETURNS TABLE (
  tenant_id   TEXT,
  site        BIGINT,
  agendamento BIGINT,
  horario     BIGINT,
  confirmou   BIGINT,
  compareceu  BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT t.id,
         count(*) FILTER (WHERE f.etapa = 'site'),
         count(*) FILTER (WHERE f.etapa = 'agendamento'),
         count(*) FILTER (WHERE f.etapa = 'horario'),
         count(*) FILTER (WHERE f.etapa = 'confirmou'),
         count(*) FILTER (WHERE f.etapa = 'confirmou' AND a.status = 'concluido')
    FROM plataforma.tenants t
    LEFT JOIN funil f
      ON f.tenant_id = t.id
     AND f.data >= to_char(now() - make_interval(days => dias), 'YYYY-MM-DD')
    LEFT JOIN appointments a
      ON a.id = f.appointment_id AND a.tenant_id = t.id
   GROUP BY t.id;
$$;

REVOKE ALL ON FUNCTION plataforma.funil_por_empresa(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION plataforma.funil_por_empresa(INT) TO vital_app;
