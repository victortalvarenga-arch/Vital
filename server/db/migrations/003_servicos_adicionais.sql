-- 003 · Serviços adicionais: vender um extra junto do principal.
--
-- Um adicional NÃO é entidade nova — é um `service` comum, indicado como extra
-- de outro. Assim ele já tem preço, duração, foto e quem executa, sem duplicar
-- nada. Depilação de nariz pode ser vendida sozinha e como extra da limpeza de
-- pele; é o mesmo cadastro nos dois casos.
--
-- Dois níveis, porque a empresa pensa dos dois jeitos:
--   por serviço   → "na limpeza de pele, ofereça buço"
--   por categoria → "em qualquer serviço de Unhas, ofereça esmaltação"
-- O que o site oferece é a união dos dois.

CREATE TABLE service_addons (
  tenant_id  TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true),
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  addon_id   TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, addon_id),
  -- Um serviço oferecendo a si mesmo como extra dobraria o preço em silêncio.
  CONSTRAINT addon_nao_e_ele_mesmo CHECK (service_id <> addon_id)
);
CREATE INDEX idx_addons_tenant ON service_addons(tenant_id, service_id);

-- Categoria é texto livre na tabela `services`, não uma tabela própria. Guardar
-- o nome aqui é o preço dessa escolha: renomear a categoria deixa estas linhas
-- órfãs, e elas simplesmente param de valer. Aceitável — o estrago é uma oferta
-- que some, não dado perdido.
CREATE TABLE category_addons (
  tenant_id TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true),
  categoria TEXT NOT NULL,
  addon_id  TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (tenant_id, categoria, addon_id)
);
CREATE INDEX idx_cat_addons ON category_addons(tenant_id, categoria);

-- O que a cliente escolheu de extra num agendamento.
--
-- Preço e duração ficam congelados aqui, como em `appointments`: o relatório do
-- mês passado precisa do valor cobrado na época, não do preço de hoje.
--
-- `appointments.service_id` continua sendo o serviço PRINCIPAL, e
-- `appointments.valor` e `.duracao` já somam os extras. Foi de propósito: o
-- motor de horários lê `duracao` e o financeiro lê `valor`, então os dois
-- continuam corretos sem uma linha de mudança.
CREATE TABLE appointment_addons (
  tenant_id      TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true),
  appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  service_id     TEXT NOT NULL REFERENCES services(id),
  nome           TEXT NOT NULL,     -- congelado: o serviço pode ser renomeado depois
  preco          NUMERIC(10,2) NOT NULL DEFAULT 0,
  duracao        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (appointment_id, service_id)
);
CREATE INDEX idx_appt_addons ON appointment_addons(tenant_id, appointment_id);

-- Mesmas políticas das outras tabelas de negócio.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['service_addons', 'category_addons', 'appointment_addons'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY isolamento_por_empresa ON %I
        USING (tenant_id = current_setting('app.tenant_id', true))
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true))
    $f$, t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON service_addons, category_addons, appointment_addons TO vital_app;
