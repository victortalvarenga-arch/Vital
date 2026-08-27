# Estúdio Agenda

Sistema de agendamento, cadastro de clientes e CRM por WhatsApp para um estúdio de
estética. Dois públicos numa base só: a cliente que agenda pelo site e a equipe que
opera o painel.

## Como este repositório se documenta

Dois arquivos, dois papéis — e os dois viajam com a pasta do projeto: qualquer
sessão do Claude Code aberta aqui, nesta conta ou em outra, os lê e continua de
onde paramos, sem depender de memória de conversa.

- **Este arquivo, `CLAUDE.md`** — o estado atual, implementado. Carregado
  automaticamente no início de toda sessão. Uma decisão só entra aqui depois
  que o código que ela descreve já existe de verdade.
- **`ROADMAP.md`** — o plano: blocos futuros e as decisões de arquitetura por
  trás deles, cada uma com o porquê. Não carrega sozinho; este arquivo aponta
  para ele, e quando um bloco do roteiro é concluído, a decisão dele migra para
  aqui.

Regra prática: toda decisão de arquitetura que tomarmos em conversa — não só
mudança de código — vira parágrafo num desses dois arquivos, com o motivo. Se
não está escrito, não aconteceu; a próxima sessão não vai adivinhar.

Isso só viaja para *outra máquina* se a pasta for copiada ou publicada num
repositório Git com remoto — hoje é uma pasta local (`is a git repository:
false`). Avise se quiser colocar em Git/GitHub para acessar de outro lugar.

## Como rodar

```bash
npm run setup     # instala server/ e web/ e popula o banco de exemplo
npm run dev       # sobe API (3333) e front (5173) juntos
```

Só o backend: `cd server && npm run dev`. Zerar o banco: `cd server && npm run reset`.

## Arquitetura

```
server/          Express + SQLite (better-sqlite3). Fonte da verdade.
  db/migrations/ Esquema em migrations numeradas, versionadas por user_version.
  src/lib/       availability.js (horários), templates.js (mensagens),
                 migrate.js (migrations) e tenant.js (empresa + config padrão)
  src/routes/    catalogo | clientes | agendamentos | publico | mensagens | relatorios
  src/jobs/      geração e despacho da fila de WhatsApp (node-cron)
  src/whatsapp/  provider trocável: 'manual' (links wa.me) ou 'meta' (Cloud API)
web/             Vite + React, sem framework de UI. CSS escrito à mão em styles.css.
  src/api.js     único ponto que fala com a API; traduz nomes servidor ↔ tela
  src/App.jsx    site público e painel no mesmo bundle
```

## Decisões que valem manter

**Datas são texto, não `Date`.** `'YYYY-MM-DD'` e `'HH:MM'` em todo lugar, banco
incluso. O estúdio opera num fuso só; usar `Date` com UTC só cria bug de agenda
virando o dia. Helpers em `server/src/lib/dates.js`.

**Conflito de horário se valida no servidor, sempre.** `lib/availability.js` é o
único lugar que decide se um horário está livre. O front tem uma cópia simplificada
só para desenhar a grade rápido — ela nunca autoriza gravação. Duas clientes clicam
no mesmo horário no mesmo segundo; só o banco resolve isso.

**Nada é apagado se tem histórico.** Excluir serviço ou profissional com
agendamentos vinculados apenas desativa (`ativo = 0`). O relatório do mês passado
precisa do nome.

**Toda linha de negócio tem `tenant_id`.** Hoje é sempre `'default'` e é um
deploy por empresa. A coluna existe assim mesmo porque acrescentá-la depois, com
agenda cheia, é a migração cara. Quem decide de quem é o dado é
`lib/tenant.js` — nunca escreva `'default'` na mão numa consulta.

**A config da empresa mora em `tenants.config`, não em `settings`.** É JSON, e o
que o banco guarda é só o que foi alterado: `getConfig()` mescla por cima de
`configPadrao`. Campo novo de personalização não precisa de migration. As chaves
operacionais (`passoAgenda`, `horaLembreteVespera`...) são planas porque o
código já as lê assim; o que é novo vem agrupado em `marca`, `textos`,
`vocabulario` e `exibir`.

**A fila de mensagens é uma tabela, não um efeito colateral.** `gerarFila()` decide
quem recebe o quê e grava em `messages` com `dedupe_key`. `despachar()` entrega.
Separado de propósito: dá para revisar antes de disparar, e nada se perde se a API
da Meta cair no meio.

**O front recarrega o estado inteiro depois de cada mutação.** `GET /api/estado`
devolve tudo numa chamada. Simples e sempre correto. Se um dia ficar lento, o lugar
de otimizar é aqui — não vale complicar antes.

## O que falta (em ordem de importância)

> O plano de virar produto white-label (multi-tenant, separação site/painel,
> redesign, personalização por empresa) está em `ROADMAP.md`, dividido em blocos.
> Ele reorganiza e supera a lista abaixo — leia os dois.


1. **Separar o bundle público do painel.** Hoje `App.jsx` carrega `/api/estado` —
   que exige token — para as duas telas. O site deveria usar só
   `/api/publico/vitrine`. Enquanto isso não for feito, não exponha o front na
   internet com `ADMIN_TOKEN` embutido.
2. **Autenticação de verdade.** Hoje é um token único no `.env`. Para mais de uma
   pessoa operando, criar tabela de usuários com senha hasheada (argon2) e sessão.
3. **Pagamento online.** Não existe ainda. Criar `server/src/routes/pagamentos.js`
   com Asaas ou Mercado Pago: gerar cobrança Pix/link no `POST /api/publico/agendar`,
   receber webhook e escrever em `appointments.pag_status` / `pag_ref`. Não confie
   no front para dizer que foi pago.
4. **WhatsApp oficial.** `WHATSAPP_PROVIDER=meta` já está implementado, mas cada
   template precisa ser cadastrado e aprovado no WhatsApp Manager e o nome colocado
   em `templates.meta_template_name`. Fora da janela de 24h só sai template aprovado;
   texto livre é rejeitado.
5. **Webhook de resposta.** Quando a cliente responde "SIM", marcar o agendamento
   como confirmado, e "PARAR" desligar o `optin`.
6. ~~**Migrations.**~~ Feito no Bloco 0: `db/migrations/*.sql` versionadas por
   `PRAGMA user_version`, aplicadas por `lib/migrate.js`. Nunca edite uma
   migration já aplicada — crie a próxima.
7. **Testes do motor de horários.** É a parte que quebra silencioso e cara caro.

## Convenções

- Código e comentários em português. Nomes de tabela e coluna em inglês
  (`clients`, `staff_id`) porque é o que ORMs e ferramentas esperam.
- Comentário explica *por que*, não *o que*. Se o código não estiver óbvio, prefira
  reescrever o código.
- Sem biblioteca de UI. O CSS em `web/src/styles.css` usa variáveis e é curto de
  propósito; não introduza Tailwind ou styled-components sem motivo forte.
- Telefone é guardado só com dígitos, sem `+55`. A conversão para o formato da API
  do WhatsApp acontece em `foneE164()`.

## LGPD

O sistema guarda nome, telefone, endereço e data de nascimento — dado pessoal.
`clients.optin` controla mensagens de marketing (aniversário, campanhas) e é
respeitado em `jobs/mensagens.js` e nas campanhas. Lembretes de agendamento são
comunicação transacional e não dependem de opt-in. Ao adicionar qualquer disparo
novo, decida em qual das duas categorias ele cai.
