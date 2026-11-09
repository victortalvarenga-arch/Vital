-- 037 · Dois textos novos, e a vaga de última hora com dia e hora.
--
-- `remarcacao`: remarcar apagava os lembretes pendentes e não avisava ninguém,
-- embora a tela dissesse que a mensagem saía pela fila.
--
-- `pos_cuidado`: quem fez mais de um atendimento na semana recebia um "como foi?"
-- por atendimento, às vezes dois iguais no mesmo dia. Passa a receber um só, com
-- uma pergunta geral.
--
-- As empresas que já existem recebem os dois aqui; as novas, de TEMPLATES_PADRAO.
-- Os textos são os mesmos de lá. O ON CONFLICT cobre empresa que já tenha a chave.

INSERT INTO templates (id, tenant_id, chave, titulo, quando, tipo, ativo, texto)
SELECT 'tpl-remarcacao-' || t.id, t.id, 'remarcacao', 'Horário remarcado',
       'Assim que a equipe muda o dia ou a hora', 'auto', 1,
       E'Oi {cliente}! Seu horário mudou. O novo é:\n\n📅 {data} às {hora}\n✨ {servico} com {profissional}\n\nSe não puder nesse horário, é só chamar por aqui que a gente ajeita.'
  FROM plataforma.tenants t
ON CONFLICT (tenant_id, chave) DO NOTHING;

INSERT INTO templates (id, tenant_id, chave, titulo, quando, tipo, ativo, texto)
SELECT 'tpl-pos-cuidado-' || t.id, t.id, 'pos_cuidado', 'Pós-atendimento da semana',
       'No lugar do pós-atendimento, para quem veio mais de uma vez na semana', 'auto', 1,
       E'Oi {cliente}, tudo bem? Passando pra saber como você está depois dos seus atendimentos na {empresa} 😊\n\nFicou tudo como você queria? Se precisar de algum cuidado ou tiver alguma dúvida, é só me chamar.'
  FROM plataforma.tenants t
ON CONFLICT (tenant_id, chave) DO NOTHING;

-- O "hoje" fixo mentiria com o dia escolhido no disparo. Só troca o texto padrão:
-- o que a empresa reescreveu continua dela.
UPDATE templates
   SET texto = E'Oi {cliente}! Abriu uma vaga para {data} às {hora} 🙌\n\nSe quiser aproveitar, me responde nos próximos minutos que eu seguro pra você.'
 WHERE chave = 'vaga'
   AND texto = E'Oi {cliente}! Abriu uma vaga hoje às {hora} 🙌\n\nSe quiser aproveitar, me responde nos próximos minutos que eu seguro pra você.';
