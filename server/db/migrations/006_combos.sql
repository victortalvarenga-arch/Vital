-- 006 · Combos: pacote de serviços com preço fechado.
--
-- "Limpeza de pele + Design de sobrancelha por R$ 200, em vez de R$ 225."
-- Serve para vender o serviço parado junto do que já tem procura.
--
-- ---------------------------------------------------------------------------
-- Por que o combo NÃO virou um agendamento com adicionais
-- ---------------------------------------------------------------------------
-- Era o caminho óbvio: o Bloco 6c já sabe pendurar vários serviços num
-- agendamento só. Mas um agendamento tem UM `staff_id`, e combo executado por
-- duas pessoas é o caso que a regra de comissão precisa cobrir.
--
-- Aqui cada serviço do combo vira um agendamento normal — um profissional, um
-- horário, uma duração —, e os agendamentos ficam ligados por `combo_grupo`.
-- O ganho é que nada mais precisa mudar: o motor de horários continua
-- reservando uma cadeira por vez, a agenda do painel desenha os blocos reais, e
-- o financeiro soma `valor` por profissional como sempre somou.
--
-- ---------------------------------------------------------------------------
-- O desconto é rateado na gravação, não na hora do relatório
-- ---------------------------------------------------------------------------
-- Regra do negócio: o desconto do combo (soma dos avulsos − preço do pacote) é
-- dividido entre as profissionais envolvidas **na proporção do preço de tabela
-- do serviço de cada uma**. Quem leva o serviço mais caro absorve a maior parte
-- do desconto. Com uma pessoa só, ela absorve tudo — que é a mesma conta, não
-- um caso à parte.
--
-- Esse rateio é gravado no `valor` de cada agendamento no momento da venda.
-- Guardar só o preço do combo e ratear na hora de fechar a comissão daria outra
-- resposta a cada vez que a tabela de preços mudasse — e comissão paga não se
-- recalcula. Ver `lib/combos.js`.

CREATE TABLE combos (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true),
  nome       TEXT NOT NULL,
  descricao  TEXT DEFAULT '',
  preco      NUMERIC(10,2) NOT NULL,
  foto       TEXT DEFAULT '',
  -- Promoção de Natal não pode continuar no ar em março. Nulo = sem prazo.
  valido_ate TEXT,                          -- 'YYYY-MM-DD'
  ativo      INTEGER NOT NULL DEFAULT 1,
  ordem      INTEGER DEFAULT 0,
  criado_em  TEXT NOT NULL
);

-- Quais serviços entram no pacote. `ordem` é a sequência do atendimento: a
-- cliente faz um depois do outro, e é nessa ordem que os horários são
-- reservados.
CREATE TABLE combo_services (
  tenant_id  TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true),
  combo_id   TEXT NOT NULL REFERENCES combos(id)   ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  ordem      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (combo_id, service_id)
);
CREATE INDEX idx_combo_svc ON combo_services(tenant_id, combo_id);
CREATE INDEX idx_combos_tenant ON combos(tenant_id, ativo, ordem);

-- `combo_id` diz de qual pacote o agendamento saiu; `combo_grupo` amarra os
-- irmãos da mesma venda. Os dois são necessários: o mesmo combo pode ser
-- comprado várias vezes pela mesma cliente, e cancelar uma compra não pode
-- derrubar a outra.
ALTER TABLE appointments ADD COLUMN combo_id    TEXT REFERENCES combos(id);
ALTER TABLE appointments ADD COLUMN combo_grupo TEXT;
CREATE INDEX idx_appt_combo_grupo ON appointments(tenant_id, combo_grupo);

-- Mesmas políticas das outras tabelas de negócio.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['combos', 'combo_services'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY isolamento_por_empresa ON %I
        USING (tenant_id = current_setting('app.tenant_id', true))
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true))
    $f$, t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON combos, combo_services TO vital_app;
