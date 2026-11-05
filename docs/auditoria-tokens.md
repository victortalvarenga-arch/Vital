# Auditoria de tokens

Data: 2026-10-30. Só proposta: nada aqui foi aplicado.

**Objetivo:** gastar menos tokens por sessão do Claude Code neste repositório
sem perder regras que evitam erro.

**O teste usado em cada linha:** se ela sair, a próxima sessão comete um erro
que não descobriria lendo o código? Se sim, a linha fica (ou muda de lugar,
para onde ainda carrega quando é necessária). Se não, sai.

Os tamanhos são estimativas. Para confirmar, rode `/context` no começo de uma
sessão nova e compare com a tabela abaixo.

## 1. O que carrega em toda sessão

| Item | Tamanho estimado | Dá para mexer? |
|---|---|---|
| `CLAUDE.md` (245 linhas) | ~4.300 tokens | Sim, é o maior item do projeto |
| Descrições das 39 skills de `.claude/skills` | ~1.500 tokens | Sim |
| Instruções do conector Claude Docs e nomes das ferramentas do Gmail | ~1.000 tokens | Sim, se não forem usados neste projeto |
| Plugin `frontend-design` | pouco | Sim, repete a skill `impeccable` |
| Memória do projeto | 0 (vazia) | — |
| Prompt do Claude Code e da extensão | fixo | Não |

### O custo que o `/context` não mostra: o verificador de design

A skill `impeccable` registra dois hooks em `.claude/settings.local.json`:

- **depois de cada `Edit`/`Write`:** injeta os achados do detector, muitas
  vezes os mesmos de antes ("Still has 47 findings…");
- **no fim de cada resposta (`Stop`):** faz uma passada completa.

Numa sessão longa de ajustes de tela, a passada do fim de resposta abriu várias
rodadas extras só para tratar avisos. É provavelmente o maior gasto variável do
projeto.

## 2. `CLAUDE.md`, seção por seção

| Linhas | Trecho | Classe | Motivo |
|---|---|---|---|
| 1–17 | O que é o produto, RLS, dados reais da primeira cliente | **Manter** | A regra dos dados reais não está no código |
| 19–21 | "O que falta para virar negócio" | **Cortar** | Repete o `ROADMAP.md` e as linhas 235–245 |
| 23–24 | Onde está cada coisa | **Manter** (1 linha) | |
| 26–52 | Os cinco arquivos, "Achados", "Importante para produção" | **Encurtar** | A regra fica; tabela e explicações podem cair à metade |
| 54–68 | Revisar a documentação a cada tarefa | **Encurtar** | Fica a regra; a história do "já aconteceu" sai |
| 72–78 | Português, comentário explica o porquê, sem biblioteca de UI | **Encurtar** | O código já mostra; basta uma linha |
| 79–96 | `className` sem regra, prefixos de tela, nada de `ad-` | **Mover** para `web/CLAUDE.md` | Só vale ao mexer em CSS |
| 97–130 | Migration, `?`, `rota()`, `escopoDe`, `Promise.all`, `exige`, `tenant_id`, `plataforma.tenants`, `comEmpresa`, transação, Neon, datas, telefone | **Mover** para `server/CLAUDE.md` | Só vale no servidor; "datas são texto" e "telefone só dígitos" o código já mostra |
| 131–135 | O site nunca importa `painel-api.js` | **Manter** | Segurança, e cruza as duas pastas |
| 136–162 | `/api/plataforma`, funil, `REVOKE`, `limite()`, vitrine, `comissaoCentavos` | **Mover** para `server/CLAUDE.md` | Só vale no servidor |
| 163–168 | Nada de conteúdo de um ramo só | **Manter** | Regra de produto que não aparece no código |
| 169–171 | Dinheiro em centavos, a sobra tem dono | **Mover** para `server/CLAUDE.md` | |
| 172–175 | Teste nunca importa `src/` no topo | **Mover** para `server/CLAUDE.md`, em destaque | Já apagou o banco de desenvolvimento uma vez |
| 176–191 | Imagem, tokens de conta externa, atendente por IA | **Mover** para `server/CLAUDE.md` (o atendente pode ir para `server/src/atendente/CLAUDE.md`) | |
| 192–197 | Toda opção do Site vale nos quatro modelos | **Mover** para `web/src/site/CLAUDE.md` | |
| 198–214 | Seed, lint, testes, quebrar de propósito, PowerShell e acentos | **Manter, mais curto** | Valem para qualquer tarefa |
| 216–233 | Ao construir telas novas | **Mover** para `web/CLAUDE.md` | Só vale para tela |
| 235–245 | "O que falta" | **Cortar** | Repete o `ROADMAP.md` |

**Por que mover em vez de cortar:** o Claude Code lê o `CLAUDE.md` de uma
subpasta quando trabalha em arquivos dela. A regra continua valendo; só deixa de
pesar nas sessões que não tocam ali.

**Estimativa:**

| Arquivo | Hoje | Depois | Quando carrega |
|---|---|---|---|
| `CLAUDE.md` (raiz) | ~4.300 | ~1.500 | Sempre |
| `server/CLAUDE.md` | — | ~1.800 | Ao mexer no servidor |
| `web/CLAUDE.md` (+ `web/src/site/`) | — | ~700 | Ao mexer em tela |

Uma sessão só de documentação ou de roteiro economiza ~2.800 tokens; uma só de
servidor, ~1.000; uma de tela, ~2.100.

## 3. O resto que carrega sempre

| Item | Proposta | Economia |
|---|---|---|
| Passada do verificador no fim de cada resposta (`Stop`) | Desligar; rodar `/impeccable audit` quando quiser revisar | Grande: corta turnos inteiros extras |
| Aviso do verificador depois de cada edição | Manter, mas só com achado novo (limitar `maxFindings`/`maxChars` na config) | Médio |
| Skills sem uso neste projeto (`scaffold-exercises`, `migrate-to-shoehorn`, `setup-ts-deep-modules`, `teach`, `writing-*`, `to-tickets`, `ask-matt`, `retro`…) | Desativar neste projeto, com a lista aprovada antes | ~800 tokens |
| Conectores Claude Docs e Gmail | Desligar neste projeto se não forem usados | ~1.000 tokens |
| Plugin `frontend-design` | Desinstalar ou deixar só em outros projetos | Pequeno |

## 4. Hábitos que gastaram muito

- **Capturas de tela:** cada uma custa por volta de mil tokens. Conferir pelo
  texto da página antes; abrir a imagem só quando o texto não basta.
- **Avaliações com dois agentes:** a `critique` roda duas avaliações em paralelo
  e custa caro. Uma por leva de correções basta, não uma por ajuste.
- **Uma sessão longa para tudo:** usar `/clear` ao trocar de assunto. Com a
  documentação em dia, a sessão nova não perde nada.

## 5. Restrições para aplicar

- Não cortar nenhuma regra de segurança, de banco descartável
  (`VITAL_BANCO_DESCARTAVEL`), de dado pessoal ou dos dados da primeira cliente.
  Essas só mudam de lugar, e para onde ainda carregam quando são necessárias.
- Regras que cruzam pastas (o site não importa `painel-api.js`, nada de conteúdo
  de um ramo só, `tenant_id`) ficam na raiz.
- Não desligar o verificador inteiro, só a passada do fim de resposta.
- Não apagar nem desativar skill sem a lista aprovada.
- Depois de mover, abrir uma sessão nova mexendo no servidor e outra mexendo em
  `web/`, e conferir que as regras aparecem quando devem.
- Atualizar a tabela "Como este repositório se documenta" do `CLAUDE.md` para
  citar os `CLAUDE.md` por pasta.
