# Vital

Site de agendamento, painel de gestão e CRM por WhatsApp, para vários negócios ao
mesmo tempo. Cada empresa se cadastra sozinha, ganha o próprio endereço e a
própria marca; o banco é um só, e o isolamento é do Postgres.

O estúdio de estética que aparece ao rodar é dado de exemplo do `seed`, não o
cliente do sistema. Como o sistema é montado: `ARQUITETURA.md`. O que ainda falta:
`ROADMAP.md`.

## Rodar

Precisa de **Node 20+** e de um banco **PostgreSQL 17 na Neon** (tier gratuito,
sem cartão). Não precisa de Postgres instalado na máquina, nem de Docker ou
Redis. O banco é compartilhado entre as máquinas de quem programa: a mesma
versão de esquema em todas, sem instalar nada.

**Banco (uma vez só, no painel da Neon).** Crie um *branch* descartável — `dev`,
a partir do `production` — e, em *Connect*, com **"Connection pooling"
desmarcado**, copie a string de conexão. O host não pode ter `-pooler`: a
aplicação prende a empresa à conexão (`ARQUITETURA.md`), e um pooler em modo
transação misturaria as empresas.

```bash
npm install                              # concurrently, na raiz
cp server/.env.example server/.env       # preencha as duas URLs e VITAL_BANCO_DESCARTAVEL=sim
npm run setup                            # instala server/ e web/, cria e popula o banco
npm run dev                              # API em :3333, front em :5173
```

No `server/.env`:

- `DATABASE_ADMIN_URL` — a string do `neondb_owner`, direta, como a Neon dá.
- `DATABASE_URL` — o mesmo host e banco, com usuário `vital_app` e uma senha que
  **você inventa**. Não se cria nada no painel da Neon: a migration cria o papel
  e o `setup` grava a senha nele.
- `VITAL_BANCO_DESCARTAVEL=sim` — só no branch de desenvolvimento. Sem isso,
  `reset`, `seed` e `senha-app` se recusam a tocar em banco que não seja
  `localhost`. **Nunca no branch de produção.**

### Montar em outra máquina, com os mesmos dados

O banco vive na Neon, então a segunda máquina **não roda `setup` nem `reset`**:
o banco já está pronto e populado. Basta clonar, `npm install`, copiar o
`server/.env` da primeira máquina (as senhas não vão para o Git) e `npm run dev`.
Esquema e dados são os mesmos em todas — mesmos serviços, mesma equipe, o combo,
a ficha de anamnese do painel, os adicionais e as duas empresas de exemplo. Não
há dump de banco para copiar; e se alguém precisar recomeçar, o `reset` reconstrói
tudo por migrations e `seed` com o mesmo resultado.

Como o banco é um só, **`reset` apaga o cenário de todo mundo** que usa o mesmo
branch. Avise antes.

**As fotos são a exceção.** Elas não cabem no Git — `server/uploads/` é pasta
de arquivo enviado por empresa — e vivem num bucket público, apontado por
`UPLOADS_BASE_URL` no `server/.env`. Com a variável preenchida, máquina nova
nasce com o site completo; sem ela, nasce sem imagem nenhuma. O endereço do
bucket está em `ACESSOS-DEV.md`.

`cd server && npm run reset` refaz esse cenário do zero a qualquer momento, e é
o comando para voltar ao ponto de partida depois de testar coisas.

O que o cenário traz, e por que cada peça está lá:

| | Para quê |
|---|---|
| **Laura Faust** — 12 serviços em 4 categorias, 3 pessoas, 6 clientes, agenda de 4 meses | Telas cheias, relatório com número — é a bancada de ensaio da primeira cliente real da Vital, com nome, cor e fotos dela mesma (mais uma ilustrativa, do site de referência que ela trouxe) |
| **Barbearia do João** — outro ramo, outra cor, outro vocabulário | Ver o isolamento entre empresas funcionando |
| **Duas unidades na Barbearia** (Centro, Zona Sul) | O passo "onde você quer ser atendida" só aparece com mais de uma, e o site passa a mostrar os endereços delas. João fica sem unidade de propósito: é o caso de quem atende nos dois endereços. Ficam na Barbearia, e não na Laura, porque ela tem um endereço só — o de verdade |
| **Combo "Dia de cuidado"** | Preço cheio riscado, economia calculada, rateio da comissão |
| **Adicionais** na limpeza e no peeling | Um extra que também se vende sozinho (design de sobrancelha) e um que não (depilação de buço) |
| **Anamnese facial**, 4 perguntas | A ficha que a profissional preenche no atendimento. **Não é perguntada pelo site** — é dado de saúde; ver `ARQUITETURA.md` |
| **Perguntas frequentes** nas duas empresas | A seção do site e o `FAQPage` que o Google lê. Seis na Laura, duas na Barbearia — de propósito em dois ramos, porque o conteúdo é da empresa, não do produto |
| **Quatro meses de visitas ao site**, nas duas | A aba Funil do back-office da Vital. Sorteadas a cada `reset`, com afunilamentos diferentes: a Laura converte, a Barbearia perde quase todo mundo logo na abertura do agendamento. Quatro meses, e não um, para a compactação ter o que fechar — o `reset` diz quantos dias compactou |

Contas e endereços: `ACESSOS-DEV.md`.

Três páginas, três bundles — um público cada:

| Endereço | O que é |
|---|---|
| <http://laurafaust.localhost:5173> | Site da cliente — escolhe serviço e agenda |
| <http://laurafaust.localhost:5173/painel.html> | Painel da equipe — opera o negócio |
| <http://localhost:5173/vital.html> | Página da Vital — uma empresa se cadastra aqui |
| <http://localhost:5173/vital.html#equipe> | Back-office da Vital — nossa equipe vê as empresas |
| <http://barbearia.localhost:5173> | A segunda empresa de exemplo, noutro endereço |

Cada empresa é resolvida pelo endereço: subdomínio (`lume.vital.app`) ou domínio
próprio. `*.localhost` resolve para a própria máquina sem DNS nenhum, e é assim
que as empresas de exemplo se abrem; `localhost` sem subdomínio é a empresa
padrão, **vazia** — serve à página da Vital, não ao site de ninguém. Detalhes
em `ARQUITETURA.md`.

Para mudar a cara e o texto do site (nome, cor, logo, capa, frase de abertura,
cidade, perguntas frequentes, fotos dos serviços, publicações do Instagram):
painel → **Configurações → Site da cliente**. Promoções (pacote de serviços com
preço fechado) ficam em **Cadastros → Promoções**. As imagens ficam em
`server/uploads/`, fora do Git.

O **horário de atendimento** que aparece no site não se digita em lugar nenhum:
sai da jornada da equipe, em **Cadastros → Equipe**. Mudou a jornada de alguém,
mudou o site.

**O site não tem login.** A cliente informa o WhatsApp na hora de agendar e
pronto — se já agendou antes, é reconhecida pelo número.

**O painel tem.** Na primeira vez ele pede para criar o acesso — nome, e-mail e
senha —, e quem criar vira o dono. Essa tela some assim que existir um usuário;
daí em diante só quem já está dentro convida os outros.

O `seed` popula um estúdio de estética de exemplo — ele é do desenvolvimento e
não participa do produto. Empresa de verdade nasce vazia, por
`POST /api/cadastro`, e é o assistente de primeira configuração que a põe de pé.
Para ver essa experiência, use `npm run seed -- --vazio`.

**Endereços, contas e senhas estão em `ACESSOS-DEV.md`** — inclusive as duas
empresas de exemplo e o acesso ao back-office da Vital. Todas só existem em
localhost: o `seed` confere a `DATABASE_URL` antes de criar qualquer uma.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe API e front juntos |
| `npm run dev:api` | Só o backend |
| `npm run dev:web` | Só o front |
| `cd server && npm run seed` | Roda migrations e popula um banco vazio |
| `cd server && npm run reset` | Apaga tudo e popula de novo (só em `localhost` ou com `VITAL_BANCO_DESCARTAVEL=sim`) |
| `cd server && npm run senha-app` | Redefine a senha do usuário da aplicação |
| `cd server && npm test` | Roda a suíte automatizada |
| `cd server && npm run seed -- --vazio` | Popula como uma empresa recém-cadastrada: só config e textos |

As migrations rodam sozinhas quando a API sobe.

`npm test` usa um banco separado, `neondb_teste` (o nome do banco de trabalho
mais `_teste`), criado sozinho na primeira vez, no mesmo projeto da Neon. Ele
apaga e repovoa os próprios dados a cada teste e nunca toca no banco de trabalho.
Pela rede a suíte leva alguns minutos (uns 4).

**Dois usuários de banco, de propósito.** A aplicação conecta como `vital_app`,
sem superusuário — é isso que faz o isolamento entre empresas valer, porque o
Postgres ignora Row-Level Security para superusuário. As migrations usam
`DATABASE_ADMIN_URL`, que pode criar tabela. O `npm run seed` cria o papel e
define a senha dele a partir do `.env`; nada disso é manual.

## Se algo der errado

**`DATABASE_URL não definida`** — falta copiar `server/.env.example` para
`server/.env`.

**Primeira requisição lenta, ou `Connection terminated` uma vez** — o compute
do tier gratuito da Neon dorme depois de uns 5 minutos parado e acorda na
próxima consulta (cerca de um segundo). Tente de novo.

**Muda de empresa sozinha, ou some dado** — a `DATABASE_URL` está com host
`-pooler`. Use a conexão direta (ver **Rodar**).

**`reset abortado` ou `só serve para desenvolvimento`** — o banco não é
`localhost` e falta `VITAL_BANCO_DESCARTAVEL=sim` no `server/.env`. É de
propósito; confira que a URL é do branch de desenvolvimento antes de acrescentar.

**`password authentication failed` para `vital_app`** — o papel existe mas está
sem a senha do seu `.env`. Rode `cd server && npm run senha-app`.

**`password authentication failed` para `neondb_owner`** — a senha em
`DATABASE_ADMIN_URL` não bate com a da Neon (painel → *Connect* → mostrar senha,
ou *Reset password*). Corrija a linha no `server/.env`.

**Uma consulta volta vazia sem motivo** — provavelmente está rodando fora de uma
requisição HTTP, onde não há empresa definida e o RLS esconde tudo. Envolva em
`db.comEmpresa(id, fn)`.

**Esqueci a senha do painel** — em desenvolvimento, `cd server && npm run reset`
zera tudo e a tela de primeiro acesso volta.

**Porta 3333 ou 5173 ocupada** — mude `PORT` no `server/.env` (a API) ou
`server.port` em `web/vite.config.js` (o front).

## Ver o banco por interface gráfica

O próprio painel da Neon tem o que precisa: *Tables* mostra e edita as linhas, e
o *SQL Editor* roda consulta. Ali você entra como `neondb_owner`, que **ignora o
isolamento por empresa** — vê todas as empresas de uma vez, o que é útil para
conferir e perigoso para editar.

Para consulta rápida sem abrir interface, com a mesma credencial de admin do
`server/.env`:

```bash
psql "<DATABASE_ADMIN_URL>" -c "SELECT nome, preco FROM services ORDER BY ordem;"
```

O pgAdmin também serve: *Add New Server* com o host, o usuário e a senha da
`DATABASE_ADMIN_URL`, e SSL ligado (*SSL mode: require*).

## Documentação

| Arquivo | Para quê |
|---|---|
| `ARQUITETURA.md` | Como o sistema é montado e por quê |
| `ROADMAP.md` | O plano: blocos futuros e decisões de arquitetura |
| `CLAUDE.md` | Regras para quem programa aqui (lido pelo Claude Code) |
