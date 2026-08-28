# Estúdio Agenda

Sistema de agendamento, cadastro de clientes e CRM por WhatsApp. Hoje atende um
estúdio de estética; o alvo é virar produto que a Vital vende para várias
empresas — o plano está em `ROADMAP.md`.

Como rodar: `README.md`. Como o sistema é montado: `ARQUITETURA.md`.

## Como este repositório se documenta

Quatro arquivos, quatro papéis. Todos viajam no Git, então qualquer sessão do
Claude Code — nesta conta ou em outra, nesta máquina ou noutra — recupera o
contexto inteiro lendo os arquivos, sem depender de memória de conversa.

| Arquivo | Papel |
|---|---|
| `CLAUDE.md` | Regras de trabalho e convenções. Carregado automaticamente em toda sessão. |
| `ARQUITETURA.md` | Como o sistema é montado hoje e por quê. Estado atual, implementado. |
| `ROADMAP.md` | O plano: blocos futuros e as decisões de arquitetura por trás deles. |
| `README.md` | Só o necessário para rodar o projeto. |

**Cada assunto mora em um lugar só.** Arquitetura não se repete no `CLAUDE.md`
nem no `README.md` — se precisar citar, aponte para `ARQUITETURA.md`. Quando um
bloco do `ROADMAP.md` é concluído, a decisão dele migra para `ARQUITETURA.md` e
sai do roteiro.

Ao descobrir algo que só vira problema com cliente real acessando — segredo
exposto, limite de conexão, backup, dado pessoal —, o lugar é a seção
**"Importante para produção"** do `ROADMAP.md`, não um comentário no código.

### Revisar a documentação a cada tarefa

**Ao terminar qualquer tarefa, reveja os quatro arquivos antes de dar a tarefa
por encerrada** — não só o que parece relacionado. Pergunte de cada um: alguma
frase aqui ficou falsa agora?

Não é burocracia: já aconteceu de o `CLAUDE.md` afirmar "hoje é uma pasta local,
não é repositório Git" horas depois de o projeto ter ido para o GitHub, e de a
lista de pendências pedir para criar a tabela `users` que já existia. Documento
errado é pior que documento ausente — manda a próxima sessão para o caminho
errado com confiança.

Toda decisão de arquitetura tomada em conversa — não só mudança de código — vira
parágrafo em `ARQUITETURA.md` ou `ROADMAP.md`, com o motivo. Se não está
escrito, não aconteceu.

## Convenções

- Código e comentários em português. Nomes de tabela e coluna em inglês
  (`clients`, `staff_id`) porque é o que ORMs e ferramentas esperam.
- Comentário explica *por que*, não *o que*. Se o código não estiver óbvio,
  prefira reescrever o código.
- Sem biblioteca de UI. Cada bundle tem seu CSS (`site/styles.css`,
  `painel/styles.css`), com variáveis e curto de propósito; não introduza
  Tailwind ou styled-components sem motivo forte.
- Ao mexer no CSS de um bundle, confira se toda `className` do JSX tem regra
  correspondente. Já aconteceu de `.chip` sumir numa divisão de arquivo: os
  botões viraram texto solto, o clique continuou funcionando e a tela parecia
  quebrada sem nenhum erro no console.
- Nunca edite uma migration já aplicada — crie a próxima.
- Todo acesso ao banco é assíncrono (`await db.get/all/run`). Consultas usam `?`
  como marcador; `db.js` traduz para `$1` do Postgres.
- Todo handler de rota assíncrono vai embrulhado em `rota()`, senão erro nele
  pendura a requisição sem resposta.
- Rota que grava agenda ou dinheiro passa por `escopoDe` como a que lê. Filtrar
  só a leitura deixa a escrita aberta a quem souber o id — e id circula em link
  e em URL.
- Nada de `Promise.all` com várias consultas: a requisição inteira roda numa
  conexão só, que atende uma por vez. Não ganha paralelismo e o `pg` avisa que
  vai parar de aceitar.
- Rota nova do painel precisa de `exige('poder')` quando não é para todos os
  papéis. Esconder o botão na tela não é controle de acesso — a chamada direta
  passa por cima.
- Nunca escreva `tenant_id` numa consulta — nem no `WHERE`, nem no `INSERT`. O
  banco filtra e preenche sozinho (Row-Level Security). Ver `ARQUITETURA.md`.
- Código que roda fora de uma requisição HTTP (cron, seed, script) precisa de
  `db.comEmpresa(id, fn)`, senão o banco não devolve nem aceita nada.
- Datas e horas são texto (`'YYYY-MM-DD'`, `'HH:MM'`), nunca `Date`. O porquê
  está em `ARQUITETURA.md`.
- Telefone é guardado só com dígitos, sem `+55`.
- O site (`web/src/site/`) importa `shared/publico.js` e **nunca** o
  `painel-api.js`: é o que mantém a credencial do painel fora do bundle público.
- Campo novo na config não entra na vitrine sozinho — `/api/publico/vitrine`
  monta a resposta a dedo, para não publicar segredo por descuido.
- Nada de lista fixa de categoria, ramo ou serviço no código: cada empresa tem
  as suas. Use texto livre com sugestões do que já existe.
- Imagem sempre passa por `shared/imagem.js` antes de subir, e o nome do
  arquivo é decidido pelo servidor, nunca pelo cliente.
- Mexeu em regra de negócio, rode `cd server && npm test`. Teste novo entra em
  `server/test/`, com banco de verdade — ver `ARQUITETURA.md`.
- Teste verde não é prova. Antes de dar a cobertura por feita, quebre o código
  de propósito e confira que a suíte acusa. Já aconteceu de um teste passar com
  o motor quebrado porque ele refazia a conta em vez de chamar o código que
  faz.
- **Nunca grave dado com acento pela API usando PowerShell.** `Invoke-WebRequest`
  com `ConvertTo-Json` corrompe UTF-8 no corpo da requisição: "Depilação" virou
  "Depila��o" no banco, e só apareceu na tela. Para escrever dado de
  teste, use um script Node (`node arquivo.mjs`), que serializa certo.

## Ao construir telas novas

- **Mobile primeiro.** Quase todo agendamento sai do celular, e site e painel
  vão virar app (Capacitor) no futuro: nada que dependa de mouse — sem hover
  como única pista, sem botão direito, alvo de toque confortável.
- **Pense em papel, não em "o usuário".** Cada empresa tem dono e funcionário,
  com permissões diferentes — e o funcionário vê só o que é dele. Esconder
  botão não é controle de acesso: a rota também precisa recusar, e rota que
  devolve agenda ou dinheiro passa por `escopoDe`.
- **Pense em muitas empresas.** A pergunta é sempre "isso funciona para uma
  Vital com 200 clientes, ou só para um estúdio?".

## O que falta

Lista completa e priorizada em `ROADMAP.md`, dividida em blocos. Os itens que
não pertencem a nenhum bloco e continuam abertos:

1. **Pagamento online.** Não existe. Criar `server/src/routes/pagamentos.js` com
   Asaas ou Mercado Pago: gerar cobrança Pix/link no `POST /api/publico/agendar`,
   receber webhook e escrever em `appointments.pag_status` / `pag_ref`. Não
   confie no front para dizer que foi pago.
2. **Webhook de resposta do WhatsApp.** Quando a cliente responde "SIM", marcar o
   agendamento como confirmado; "PARAR" desliga o `optin`.
