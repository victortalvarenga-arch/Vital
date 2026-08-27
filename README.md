# Estúdio Agenda

Site de agendamento, painel de gestão e CRM por WhatsApp. Um estúdio de estética
é o exemplo que acompanha o projeto; o alvo é servir qualquer negócio de
agendamento (ver `ROADMAP.md`).

## Rodar

Precisa de **Node 20 ou mais novo**.

```bash
npm install                              # concurrently, na raiz
cp server/.env.example server/.env       # sem isto a API não sobe configurada
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
| `cd server && npm run reset` | Apaga o banco e popula de novo |

O banco é um arquivo em `server/db/estudio.db`, criado no primeiro `setup`. Não
vai para o Git.

## Se algo der errado

**`better-sqlite3` falha ao instalar** — costuma ser versão de Node sem binário
pronto. Confira `node -v`; em Node 24 use `better-sqlite3` 12 ou mais novo.

**`npm run reset` diz que não consegue apagar o arquivo** — o servidor está
rodando e segurando o banco. Pare o `npm run dev` antes.

**Porta 3333 ou 5173 ocupada** — mude `PORT` no `server/.env` (a API) ou
`server.port` em `web/vite.config.js` (o front).

## Documentação

| Arquivo | Para quê |
|---|---|
| `ARQUITETURA.md` | Como o sistema é montado e por quê |
| `ROADMAP.md` | O plano: blocos futuros e decisões de arquitetura |
| `CLAUDE.md` | Regras para quem programa aqui (lido pelo Claude Code) |
