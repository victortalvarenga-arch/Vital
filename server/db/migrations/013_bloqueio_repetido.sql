-- 013 · Bloqueio que se repete: férias de três semanas, folga toda terça.
--
-- ---------------------------------------------------------------------------
-- Uma linha por ocorrência, e não uma regra de recorrência
-- ---------------------------------------------------------------------------
-- A alternativa seria guardar "toda terça, por 3 semanas" numa coluna e o
-- motor de horários expandir isso na hora de montar a grade. Foi descartada
-- por três motivos, nesta ordem:
--
--   1. `lib/availability.js` é o código mais testado do projeto e o que decide
--      se uma cliente consegue marcar. Ensinar recorrência a ele significaria
--      reescrever a parte que já está provada — e um erro ali não aparece como
--      erro, aparece como horário oferecido que não existe.
--   2. Cancelar uma ocorrência só é o caso normal. "Vou viajar três semanas,
--      mas na segunda eu volto para atender a Dona Marta" precisa apagar uma
--      terça sem desfazer as outras duas. Com regra, isso vira uma tabela de
--      exceções à regra.
--   3. Conflito com agendamento existente se confere por data. Com regra, a
--      conferência teria de expandir antes — o mesmo trabalho, num lugar onde
--      esquecer passa calado.
--
-- O custo é escrever N linhas. Para férias de um mês são vinte e poucas: nada
-- perto do que custaria o outro caminho.
--
-- ---------------------------------------------------------------------------
-- `serie` é só o laço
-- ---------------------------------------------------------------------------
-- Guarda qual criação gerou aquela linha, para "apagar as três semanas" ser um
-- comando e não três. Nulo em bloqueio avulso, que continua sendo a maioria.
-- Não referencia nada: se as irmãs forem apagadas uma a uma, a última continua
-- válida sozinha.

ALTER TABLE blocks ADD COLUMN serie TEXT;

-- tenant_id na frente, como os demais: a política do RLS entra como filtro em
-- toda consulta, e índice que não começa por ele não serve para ela.
CREATE INDEX idx_blocks_serie ON blocks(tenant_id, serie) WHERE serie IS NOT NULL;
