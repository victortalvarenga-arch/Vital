# Estúdio Agenda

Site de agendamento, painel de gestão e CRM por WhatsApp. Um estúdio de estética
é o exemplo que acompanha o projeto; o alvo é servir qualquer negócio de
agendamento (ver `ROADMAP.md`).

## Rodar

Precisa de **Node 20+** e **PostgreSQL 17** rodando na máquina.

```bash
# 1. Postgres, uma vez só (Windows)
winget install PostgreSQL.PostgreSQL.17
psql -U postgres -c "CREATE DATABASE vital;"

# 2. O projeto
npm install                              # concurrently, na raiz
cp server/.env.example server/.env       # ajuste DATABASE_URL se sua senha for outra
npm run setup                            # instala server/ e web/, cria e popula o banco
npm run dev                              # API em :3333, site em :5173
```

Duas páginas, dois bundles:

| Endereço | O que é |
|---|---|
| <http://localhost:5173> | Site da cliente — escolhe serviço e agenda |
| <http://localhost:5173/painel.html> | Painel da equipe — opera o negócio |

Para mudar a cara do site (nome, cor, logo, capa, textos, fotos dos serviços):
painel → **Configurações → Site da cliente**. As imagens ficam em
`server/uploads/`, fora do Git.

Na primeira vez, o painel pede para **criar o primeiro acesso** — nome, e-mail e
senha. Quem criar vira o dono. Essa tela some assim que existir um usuário; daí
em diante, só quem já está dentro convida os outros.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe API e front juntos |
| `npm run dev:api` | Só o backend |
| `npm run dev:web` | Só o front |
| `cd server && npm run seed` | Roda migrations e popula um banco vazio |
| `cd server && npm run reset` | Apaga tudo e popula de novo (só em localhost) |
| `cd server && npm run senha-app` | Redefine a senha do usuário da aplicação |

As migrations rodam sozinhas quando a API sobe.

**Dois usuários de banco, de propósito.** A aplicação conecta como `vital_app`,
sem superusuário — é isso que faz o isolamento entre empresas valer, porque o
Postgres ignora Row-Level Security para superusuário. As migrations usam
`DATABASE_ADMIN_URL`, que pode criar tabela. O `npm run seed` cria o papel e
define a senha dele a partir do `.env`; nada disso é manual.

## Se algo der errado

**`DATABASE_URL não definida`** — falta copiar `server/.env.example` para
`server/.env`.

**`ECONNREFUSED` ao subir a API** — o Postgres não está rodando. No Windows:
`Get-Service postgresql*` e, se preciso, `Start-Service postgresql-x64-17`.

**`password authentication failed` para `vital_app`** — o papel existe mas está
sem a senha do seu `.env`. Rode `cd server && npm run senha-app`.

**`password authentication failed` para `postgres`** — a senha em
`DATABASE_ADMIN_URL` não bate com a que você definiu ao instalar o Postgres.
Corrija a linha no `server/.env`.

**Uma consulta volta vazia sem motivo** — provavelmente está rodando fora de uma
requisição HTTP, onde não há empresa definida e o RLS esconde tudo. Envolva em
`db.comEmpresa(id, fn)`.

**Esqueci a senha do painel** — em desenvolvimento, `cd server && npm run reset`
zera tudo e a tela de primeiro acesso volta.

**`database "vital" does not exist`** — falta o passo 1:
`psql -U postgres -c "CREATE DATABASE vital;"`.

**Porta 3333 ou 5173 ocupada** — mude `PORT` no `server/.env` (a API) ou
`server.port` em `web/vite.config.js` (o front).

## Ver o banco por interface gráfica

O **pgAdmin 4** vem junto na instalação (menu Iniciar → *pgAdmin 4*). Na
primeira execução ele pede para criar uma senha mestra — é só dele, não tem
relação com o banco. Depois, *Add New Server*:

| Campo | Valor |
|---|---|
| Name | Vital (local) |
| Host | `localhost` |
| Port | `5432` |
| Maintenance database | `vital` |
| Username | `postgres` |
| Password | a que você definiu ao instalar o Postgres |

As tabelas ficam em *Servers → Vital → Databases → vital → Schemas → public →
Tables*.

Para consulta rápida sem abrir interface:

```bash
psql -U postgres -d vital -c "SELECT nome, preco FROM services ORDER BY ordem;"
```

## Documentação

| Arquivo | Para quê |
|---|---|
| `ARQUITETURA.md` | Como o sistema é montado e por quê |
| `ROADMAP.md` | O plano: blocos futuros e decisões de arquitetura |
| `CLAUDE.md` | Regras para quem programa aqui (lido pelo Claude Code) |
