-- 029 · Cada extra paga a própria comissão.
--
-- Até aqui o atendimento inteiro, extras incluídos, pagava a taxa do serviço
-- PRINCIPAL: a comissão cadastrada num extra era ignorada. O dono decidiu
-- (2026-10-28) que cada extra paga a sua — a exceção da pessoa naquele extra,
-- senão a do serviço-extra, senão a da pessoa — e que um pagamento parcial se
-- divide na proporção do preço de cada parte. A conta está em
-- `comissaoCentavos()`, routes/relatorios.js.
--
-- Quem ganha fixo por atendimento não recebe de novo pelo extra sem taxa
-- própria: o fixo já é o pagamento daquele horário inteiro. Extra com taxa
-- própria paga a taxa dele por cima do fixo.
--
-- A taxa do extra congela na conclusão, como a do principal (migration 025):
-- mudar a comissão de um extra hoje não reescreve o caixa de meses atrás.

ALTER TABLE appointment_addons ADD COLUMN comissao_taxa NUMERIC(5,2);

-- AFTER, e não BEFORE como o da 025: aqui se escreve em outra tabela, e o
-- atendimento precisa já estar gravado. O extra que chegar DEPOIS da conclusão
-- (gravado logo em seguida, na mesma criação) fica sem taxa congelada e a
-- conta usa a regra viva — que, nesse instante, é a mesma.
CREATE FUNCTION congelar_comissao_dos_extras() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'concluido'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'concluido'
          OR OLD.staff_id IS DISTINCT FROM NEW.staff_id) THEN
    UPDATE appointment_addons x
       SET comissao_taxa = (
             SELECT COALESCE(ss.comissao, sv.comissao,
                             CASE WHEN p.comissao_tipo = 'fixo' THEN 0 ELSE p.comissao END, 0)
               FROM staff p
               LEFT JOIN services sv ON sv.id = x.service_id
               LEFT JOIN service_staff ss ON ss.service_id = x.service_id AND ss.staff_id = p.id
              WHERE p.id = NEW.staff_id)
     WHERE x.appointment_id = NEW.id;
  ELSIF TG_OP = 'UPDATE' AND NEW.status <> 'concluido' AND OLD.status = 'concluido' THEN
    UPDATE appointment_addons SET comissao_taxa = NULL WHERE appointment_id = NEW.id;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER congelar_comissao_dos_extras
  AFTER INSERT OR UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION congelar_comissao_dos_extras();

-- O passado continua como foi pago: nos atendimentos já concluídos, o extra
-- recebe a taxa que de fato pagou até hoje — a do principal, ou nada a mais
-- quando o principal era fixo.
UPDATE appointment_addons x
   SET comissao_taxa = CASE WHEN a.comissao_tipo = 'fixo' THEN 0 ELSE a.comissao_taxa END
  FROM appointments a
 WHERE a.id = x.appointment_id AND a.status = 'concluido' AND a.comissao_tipo IS NOT NULL;
