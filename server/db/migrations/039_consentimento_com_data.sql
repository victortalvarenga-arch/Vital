-- 039 · O consentimento de marketing ganha quando e por onde.
--
-- `clients.optin` era um 0/1 sem história: nascia ligado e ninguém sabia desde
-- quando nem por onde a pessoa tinha aceitado — e provar o aceite é exatamente
-- o que a LGPD pede quando alguém reclama de uma mensagem.
--
-- Duas colunas, não uma tabela de eventos: o que importa provar é o estado
-- atual (aceita? desde quando? por onde?). A troca feita pelo painel já fica
-- em `logs` com autor e instante; isto é o resumo que a ficha e a exportação
-- leem sem juntar nada. As colunas guardam a ÚLTIMA mudança — ligar ou
-- desligar, os dois são fato com data.
--
-- Quem já existe fica com NULL/'': dizer "consentiu em tal dia" sobre quem
-- aceitou antes de existir o registro seria inventar prova.

ALTER TABLE clients ADD COLUMN optin_em     TEXT;                      -- 'YYYY-MM-DD'
ALTER TABLE clients ADD COLUMN optin_origem TEXT NOT NULL DEFAULT '';  -- site | painel | whatsapp
