---
name: vital-migration
description: Cria a próxima migration SQL da Vital em server/db/migrations com o esqueleto certo — numeração, RLS por empresa, REVOKE em tabela que só registra, GRANT de sequência — e lista o que mais precisa mudar junto (seed, teste, documentação). Use ao criar tabela, coluna, índice, função ou gatilho no banco.
disable-model-invocation: true
argument-hint: "<o que a migration faz, em poucas palavras>"
---

# Nova migration

Pedido: $ARGUMENTS

## 1. Número e nome

Liste `server/db/migrations/` e pegue o maior número. A nova é o seguinte, com
três dígitos e o assunto em português com `_`: `038_lembrete_por_profissional.sql`.

**Nunca edite uma migration que já está no Git** — o hook do projeto recusa, e
com razão: ela já rodou em algum banco. Correção de migration aplicada é
migration nova.

## 2. Cabeçalho

Toda migration abre com um comentário no estilo das existentes (veja a 031 e a
036): `-- NNN · frase do que muda.` e depois o **porquê** — o problema que
existia, a decisão tomada, a alternativa descartada. Decisão do dono vai com a
data (`decisão do dono, 2026-11-05`).

## 3. Esqueletos

**Tabela de negócio (dado de uma empresa):**

```sql
CREATE TABLE nome (
  id        TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT current_setting('app.tenant_id', true),
  -- colunas em inglês; datas 'YYYY-MM-DD' e horas 'HH:MM' como TEXT, nunca DATE
  criado_em TEXT NOT NULL
);

-- tenant_id na frente do índice, como os demais, por causa do RLS.
CREATE INDEX idx_nome_algo ON nome(tenant_id, algo);

ALTER TABLE nome ENABLE ROW LEVEL SECURITY;
ALTER TABLE nome FORCE ROW LEVEL SECURITY;
CREATE POLICY isolamento_por_empresa ON nome
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
```

**Tabela que só registra** (`logs`, `funil`, `appointment_events` e afins) —
além do acima:

```sql
-- Sem este REVOKE ela nasceria com os quatro verbos, pelo
-- ALTER DEFAULT PRIVILEGES da 002.
REVOKE UPDATE, DELETE ON nome FROM vital_app;
```

Se precisar ser podada, quem poda é uma função `SECURITY DEFINER` que só apaga
o que já foi somado — nunca o `DELETE` de volta para a aplicação.

**`BIGSERIAL`/sequência:** o default de privilégios cobre tabela, não sequência:

```sql
GRANT USAGE ON SEQUENCE nome_id_seq TO vital_app;
```

**Coluna nova:** `ALTER TABLE ... ADD COLUMN`, com `COMMENT ON COLUMN` quando o
formato não é óbvio (ver 036). Linhas existentes ganham o valor que teriam
ganhado ao nascer, num `UPDATE` na mesma migration.

**Tabela de `funil`:** coluna nova é contagem ou passo, nunca identificação.
**Funções `plataforma.numeros_por_empresa()` / `funil_por_empresa()`:** coluna
nova é coluna que pode vazar; atualize o teste que confere a lista.

## 4. O que muda junto

- [ ] `server/src/seed.js` mostra a funcionalidade (`npm run reset` reproduz tudo).
- [ ] Teste em `server/test/` com banco de verdade — escrito antes, falhando.
      Imports de `src/` dentro do `before()`, depois de `prepararBanco()`.
- [ ] Rota que lê ou grava a tabela: ver a skill `vital-rota`.
- [ ] Se a tabela guarda campo interno de serviço, `comPrecoEExtras` tira.
- [ ] `ARQUITETURA.md` ganha o parágrafo da decisão, com o motivo.

## 5. Aplicar

As migrations rodam no boot da API (`iniciarBanco()` em `server/src/db.js`):
reinicie `npm run dev` ou rode `cd server && npm test`. Nunca acrescente
`VITAL_BANCO_DESCARTAVEL` para fazer um comando rodar.
