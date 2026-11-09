---
name: vital-rota
description: Checklist e esqueleto para criar ou mudar uma rota da API da Vital (server/src/routes) sem abrir buraco entre empresas, papéis ou para o público — rota(), escopoDe, exige, limite, db.opcional, comAutoria, vitrine — com o teste escrito antes. Use ao criar endpoint novo ou mudar o que um endpoint lê, grava ou devolve.
argument-hint: "<método e caminho, e o que a rota faz>"
---

# Rota nova ou alterada

Pedido: $ARGUMENTS

## 1. Teste primeiro

Antes da rota, um teste em `server/test/<assunto>.test.js` que falha. Modelo:
`server/test/bloqueio-repetido.test.js` — `prepararBanco()`, `subirApi()`,
`criarEquipe()` de `./ambiente.js`, dados dentro de `db.db.comEmpresa(...)`.

- Nunca importe `src/` no topo do arquivo de teste: dentro do `before()`.
- Cubra o papel que **não** pode (funcionário vendo a agenda da colega,
  recepção vendo comissão, anônimo descobrindo se um telefone é cliente).
- Depois de verde, quebre a rota de propósito e veja o teste acusar.

## 2. Esqueleto

```js
import { rota } from '../lib/rota.js';
import { escopoDe, exige } from '../lib/auth.js';

recurso.post('/:id/acao', exige('poder'), rota(async (req, res) => {
  const escopo = escopoDe(req.usuario);           // null = todos; id = só aquele
  const a = await db.get('SELECT * FROM appointments WHERE id = ?', req.params.id);
  if (!a || (escopo && a.staff_id !== escopo)) {
    return res.status(404).json({ erro: 'não encontrado' });
  }
  // ...
}));
```

## 3. Checklist (cada item já falhou uma vez)

**Sempre**
- [ ] Handler assíncrono dentro de `rota()` — sem isso, erro pendura a requisição.
- [ ] Sem `tenant_id` na consulta (o RLS filtra e preenche). Sem `Promise.all`
      de consultas: uma conexão, uma consulta por vez.
- [ ] Datas `'YYYY-MM-DD'` e horas `'HH:MM'` como texto. Telefone só dígitos, sem `+55`.
- [ ] Erro de banco engolido de propósito vai em `db.opcional(fn)`. Lembre:
      exceção desfaz tudo; `res.status(409)` grava o que já gravou.

**Painel (`/api/...` logado)**
- [ ] Não é para todos os papéis → `exige('poder')` (ver `PODERES` em `lib/auth.js`).
- [ ] Lê **ou grava** agenda ou dinheiro → `escopoDe`. Filtrar só a leitura
      deixa a escrita aberta a quem souber o id.
- [ ] Devolve dinheiro, comissão ou ficha de saúde → confere também
      `financeiro` / `fichas` (a recepção tem escopo `null`).
- [ ] Comissão só por `comissaoCentavos()` (`routes/relatorios.js`). Divisão de
      dinheiro em centavos inteiros, com dono para a sobra.

**Público (`/api/publico`)**
- [ ] Escreve, ou responde se um dado existe → `limite()` (`lib/limite.js`).
      Leitura nova → balde `leitura` em `routes/publico.js`.
- [ ] Mexe na agenda em nome da cliente → `db.comAutoria({ tipo: 'cliente', origem: 'site' }, fn)`.
- [ ] Vitrine: campo novo entra a dedo; campo interno de `services` sai em `comPrecoEExtras`.

**Plataforma (`/api/plataforma`)**
- [ ] Só contagem, nunca linha de tabela de negócio.

**Agenda e mensagens**
- [ ] Mensagem nova na fila nasce com `expira_em`.
- [ ] Escrita de agenda usa as mesmas funções do site (o atendente por IA também).

## 4. Front e fechamento

- [ ] O botão escondido na tela não substitui o `exige` — confira os dois.
- [ ] Funcionalidade nova aparece no `server/src/seed.js`.
- [ ] `cd server && npm test` e `npm run lint` (na raiz) verdes.
- [ ] Peça ao agente `revisor-isolamento` para revisar o diff.
- [ ] Decisão de arquitetura vira parágrafo em `ARQUITETURA.md`.
