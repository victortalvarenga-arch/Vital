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

Abra <http://localhost:5173>. A tela abre no site público; o botão
**Área da equipe** leva ao painel.

Por padrão o `.env` vem com `ADMIN_TOKEN` vazio, o que deixa o painel **sem
senha** — bom para desenvolver, nunca para publicar. A API avisa isso no boot.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe API e front juntos |
| `npm run dev:api` | Só o backend |
| `npm run dev:web` | Só o front |
| `cd server && npm run seed` | Popula um banco vazio |
| `cd server && npm run reset` | Apaga tudo e popula de novo (só em localhost) |

As migrations rodam sozinhas quando a API sobe.

## Se algo der errado

**`DATABASE_URL não definida`** — falta copiar `server/.env.example` para
`server/.env`.

**`ECONNREFUSED` ao subir a API** — o Postgres não está rodando. No Windows:
`Get-Service postgresql*` e, se preciso, `Start-Service postgresql-x64-17`.

**`password authentication failed`** — a senha em `DATABASE_URL` não bate com a
que você definiu ao instalar o Postgres. Corrija a linha no `server/.env`.

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
