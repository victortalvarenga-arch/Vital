-- 025 · A comissão de um atendimento concluído não muda mais depois.
--
-- Até aqui a comissão era calculada na hora de cada relatório, com a taxa de
-- HOJE (`comissaoCentavos`, em routes/relatorios.js). Subir a comissão de
-- alguém de 40% para 50% reescrevia o Financeiro dos meses passados — o caixa
-- de março deixava de bater com o que foi pago em março, sem aviso.
--
-- Agora a regra que valia é gravada no próprio atendimento quando ele é
-- CONCLUÍDO: o tipo (percentual ou fixo), a taxa e o fixo. Antes de concluir,
-- vale a regra viva — é o que a empresa combinou até ali. Concluir de novo
-- (corrigiu o status e voltou) grava de novo; sair de "concluído" apaga.
--
-- Por gatilho, e não no código da rota: um atendimento é concluído pelo botão
-- do painel, pelo fechamento automático, pelo seed e por quem vier depois.
-- Lembrar de congelar em cada caminho é a forma garantida de esquecer um.
--
-- A regra é a mesma de `comissaoCentavos` (migration 020 e 022): o mais
-- específico vence — a exceção da pessoa no serviço, senão a do serviço,
-- senão a da pessoa —, e o fixo só vale quando nem o serviço nem a exceção
-- decidem e o padrão dela é fixo.

ALTER TABLE appointments
  ADD COLUMN comissao_tipo TEXT CHECK (comissao_tipo IN ('percentual', 'fixo')),
  ADD COLUMN comissao_taxa NUMERIC(5,2),
  ADD COLUMN comissao_fixo NUMERIC(10,2);

CREATE FUNCTION congelar_comissao() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'concluido'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'concluido'
          OR OLD.staff_id IS DISTINCT FROM NEW.staff_id
          OR OLD.service_id IS DISTINCT FROM NEW.service_id) THEN
    SELECT CASE WHEN ss.comissao IS NULL AND sv.comissao IS NULL AND p.comissao_tipo = 'fixo'
                THEN 'fixo' ELSE 'percentual' END,
           COALESCE(ss.comissao, sv.comissao, p.comissao, 0),
           p.comissao_fixo
      INTO NEW.comissao_tipo, NEW.comissao_taxa, NEW.comissao_fixo
      FROM staff p
      LEFT JOIN services sv ON sv.id = NEW.service_id
      LEFT JOIN service_staff ss ON ss.service_id = NEW.service_id AND ss.staff_id = NEW.staff_id
     WHERE p.id = NEW.staff_id;
  ELSIF NEW.status <> 'concluido' THEN
    NEW.comissao_tipo := NULL;
    NEW.comissao_taxa := NULL;
    NEW.comissao_fixo := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER congelar_comissao
  BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION congelar_comissao();

-- O que já foi concluído recebe a regra de hoje: é a melhor informação que
-- existe sobre o passado, e de agora em diante ela para de mudar.
UPDATE appointments a SET
  comissao_tipo = r.tipo, comissao_taxa = r.taxa, comissao_fixo = r.fixo
FROM (
  SELECT a2.id,
         CASE WHEN ss.comissao IS NULL AND sv.comissao IS NULL AND p.comissao_tipo = 'fixo'
              THEN 'fixo' ELSE 'percentual' END AS tipo,
         COALESCE(ss.comissao, sv.comissao, p.comissao, 0) AS taxa,
         p.comissao_fixo AS fixo
    FROM appointments a2
    JOIN staff p ON p.id = a2.staff_id
    LEFT JOIN services sv ON sv.id = a2.service_id
    LEFT JOIN service_staff ss ON ss.service_id = a2.service_id AND ss.staff_id = a2.staff_id
   WHERE a2.status = 'concluido'
) r
WHERE a.id = r.id;
