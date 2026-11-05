-- 035 · Cada empresa com o próprio número de WhatsApp.
--
-- Até aqui o envio pela API da Meta lia `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_ID`
-- do ambiente: um número para a plataforma inteira. Ligado, toda empresa
-- mandaria lembrete pelo mesmo WhatsApp, com o nome de uma assinando a mensagem
-- da outra. Por isso nunca foi ligado.
--
-- O token e o id do número passam a morar em `conexoes`, como o Google e o
-- Instagram: cifrados, com RLS, fora da `config` que a vitrine lê. O id do
-- número não é segredo e vai em `extra`. Empresa sem linha aqui continua no
-- modo manual (links `wa.me`), e uma não depende da outra.

ALTER TABLE conexoes DROP CONSTRAINT conexoes_provedor_check;
ALTER TABLE conexoes ADD CONSTRAINT conexoes_provedor_check
  CHECK (provedor IN ('google', 'instagram', 'whatsapp'));
