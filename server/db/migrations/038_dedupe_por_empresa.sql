-- 038 · A trava de mensagem repetida passa a valer dentro de cada empresa.
--
-- `dedupe_key` nasceu UNIQUE global na 001. Funcionava porque os ids dentro da
-- chave são aleatórios e não colidem entre empresas — mas era a única restrição
-- do sistema que atravessava a fronteira, e os `ON CONFLICT ... DO NOTHING` em
-- cima dela engoliriam EM SILÊNCIO a mensagem da empresa que chegasse depois:
-- nenhum erro, nenhuma linha, só a cliente sem o lembrete. O teste de
-- isolamento passou a cobrar que a mesma chave em duas empresas são duas
-- mensagens.
--
-- O nome do constraint importa: o código grava com
-- `ON CONFLICT ON CONSTRAINT messages_dedupe_por_empresa`, em vez de nomear as
-- colunas, porque escrever `tenant_id` em consulta é proibido de propósito —
-- quem preenche a empresa é o banco (ver CLAUDE.md).

ALTER TABLE messages DROP CONSTRAINT messages_dedupe_key_key;
ALTER TABLE messages ADD CONSTRAINT messages_dedupe_por_empresa UNIQUE (tenant_id, dedupe_key);
