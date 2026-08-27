# Estúdio Agenda

Site de agendamento + painel de gestão + CRM por WhatsApp para estúdio de estética.

## Rodar

Precisa de Node 20 ou mais novo.

```bash
npm install          # instala o 'concurrently' da raiz
npm run setup        # instala server/ e web/, cria e popula o banco
npm run dev          # API em :3333, site em :5173
```

Abra <http://localhost:5173>. A tela abre no site público; o botão
**Área da equipe** leva ao painel.

O banco é um arquivo em `server/db/estudio.db`. Para recomeçar do zero:

```bash
cd server && npm run reset
```

## O que já funciona

**Site** — serviços por categoria com preço e duração, escolha de profissional,
calendário com horários reais (consultados na API, não em cache), identificação por
WhatsApp. Se o número já existe, a cliente não preenche nada; se é primeiro acesso,
pede nome, nascimento e endereço uma única vez. Escolha entre pagar antes ou no
atendimento.

**Painel** — agenda em colunas por profissional com blocos proporcionais à duração;
status agendado / confirmado / concluído / faltou; recebimento na hora; ficha da
cliente com histórico, total gasto e há quanto tempo não aparece; cadastro de
serviços; equipe com jornada por dia da semana e comissão; financeiro com ticket
médio, faltas, ranking de serviços e comissões do mês.

**WhatsApp** — a aba mostra a fila do dia calculada pelo servidor: lembrete da
véspera, aviso no dia, pós-atendimento, aniversário e reativação de quem sumiu.
Campanhas (Dia da Mulher, Natal, vaga de última hora, promoção) são disparo manual
com seleção de quem recebe. Os textos são editáveis com variáveis como `{cliente}`
e `{hora}`.

## WhatsApp: manual agora, oficial depois

Por padrão o sistema roda em `WHATSAPP_PROVIDER=manual`. Ele monta a mensagem e
gera um link `wa.me` — o atendente clica e o WhatsApp abre com o texto pronto.
Funciona hoje, sem conta aprovada e sem custo, e serve bem para um estúdio.

Para automatizar de verdade é preciso a **API oficial do WhatsApp Business** (Cloud
API da Meta, direto ou via parceiro como Z-API, 360dialog ou Twilio). Três coisas
mudam o projeto e vale saber antes de orçar:

- Cobra-se por conversa iniciada. Mensagens de utilidade (lembrete, confirmação)
  são baratas; marketing (aniversário, promoção, Natal) custa mais.
- Fora da janela de 24 horas desde a última mensagem da cliente, só sai **template
  aprovado pela Meta**. Texto livre é rejeitado. Por isso a tabela `templates` tem
  a coluna `meta_template_name`.
- A cliente pode bloquear marketing sem afetar os lembretes. Trate as duas
  categorias como coisas diferentes.

O código já está pronto para os dois modos: troque a variável no `.env` e preencha
`WHATSAPP_TOKEN` e `WHATSAPP_PHONE_ID`.

## Pagamento

Ainda não implementado. O fluxo já registra a forma escolhida e o painel permite dar
baixa manual. Para cobrar online, veja o item 3 do `CLAUDE.md`.

## Estrutura

Veja `CLAUDE.md` — ele explica a arquitetura, as decisões de projeto e o que falta,
e é o arquivo que o Claude Code lê primeiro ao abrir a pasta.
