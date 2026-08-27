# Roteiro — de "Estúdio Agenda" para produto white-label

O estúdio de estética é o **MVP**, não o produto. O objetivo é uma base que
qualquer negócio de agendamento (salão, barbearia, clínica, petshop, oficina)
consiga vestir com a própria marca sem tocar em código.

**O negócio por trás disto: a Vital desenvolve este software e vende para
várias empresas-cliente** (cada salão, cada barbearia é um cliente da Vital,
não o produto final). Não é um sistema feito sob medida para um estúdio — é
um produto de assinatura, hospedado por nós, operado por muitos negócios ao
mesmo tempo. Essa frase sozinha já justifica boa parte do roteiro: banco
multiempresa (Blocos 1-2), painel só nosso para gerenciar quem assina (Bloco
10), provisionamento sem depender de nós atendermos manualmente (Bloco 9). Toda
vez que uma decisão nova aparecer, a pergunta é "isso funciona para uma Vital
com 200 clientes, ou só para um estúdio só?" — a segunda resposta não serve.

Este arquivo é o mapa de execução. Cada bloco é entregável e testável sozinho.
Marque o que concluir; a próxima sessão retoma daqui.

Ainda em beta: arquitetura pode mudar sem custo de migração, porque não há
cliente real na base. Isso vale até o dia em que houver o primeiro — dali em
diante, toda mudança de esquema é migração de dado de verdade.

## Três interfaces, um público cada

- **Site do cliente** — quem agenda. Não é dono de nada, não loga com senha.
- **Painel da equipe** — quem opera o negócio (dono, gerente, atendente). Um por
  empresa, vendo só os dados da própria empresa.
- **Painel da plataforma** — só a nossa equipe. Não pertence a nenhum cliente;
  enxerga a lista de empresas, plano, status, métricas agregadas.

Todas as três falam com o mesmo Postgres. O que separa uma empresa da outra não
é um arquivo nem um servidor — é `tenant_id` mais uma política de segurança que
o próprio banco aplica (Row-Level Security), então nenhuma consulta, nem uma que
esqueça o filtro, consegue devolver linha de empresa errada.

## Decisões tomadas

**Postgres gerenciado na nuvem, um banco só, isolado por Row-Level Security —
não SQLite, não arquivo por empresa.** Revisa a decisão anterior (arquivo por
empresa), que fazia sentido para rodar num servidor próprio mas esbarra na
nuvem: SQLite trava a escrita por arquivo, o que não combina com vários
processos da API rodando ao mesmo tempo nem com hospedagens de disco temporário
(a maioria das nuvens "normais" — Railway, Render, Vercel — apaga o disco a
cada deploy).

Postgres resolve isso de fábrica: foi feito para muitos processos escrevendo ao
mesmo tempo, e todo provedor de nuvem sabe hospedar. RLS fecha o risco que a
coluna `tenant_id` sozinha deixava aberto — uma política do próprio banco recusa
qualquer linha fora da empresa da conexão atual, mesmo que uma rota esqueça o
filtro no código. Cadastrar empresa nova vira um `INSERT`, não criar arquivo e
rodar migration; relatório da plataforma vira um `GROUP BY` normal, não abrir
banco por banco.

**Postgres local para desenvolver de graça; gerenciado só quando alguém além de
nós for acessar.** São dois ambientes, não dois planos concorrentes — todo
time que usa Postgres trabalha assim, não é etapa provisória a "migrar depois".
Local não tem IP fixo, cai quando desliga, não tem backup — por isso nunca é
onde o *cliente de verdade* acessa. Mas para desenvolver e testar sozinho, é
grátis para sempre e é exatamente o mesmo motor: mesmo SQL, mesmo driver `pg`,
mesma forma de conectar. O que muda de um ambiente para o outro é uma linha —
`DATABASE_URL` no `.env` — nunca código. Quando for a hora de sair do zero
custo, gerenciado (Neon ou Supabase, tier gratuito, sem cartão) resolve IP fixo,
backup automático e acesso de fora.

**Vercel hospeda o site e a API, não o banco.** Vercel é ótimo para domínio,
rotas e certificado — mas não guarda Postgres rodando dentro dele; até o
recurso "Vercel Postgres" é, por baixo, um Neon integrado. Ou seja: Postgres
gerenciado (Neon/Supabase) e hospedagem do app (Vercel) são duas contas
diferentes que se conectam por uma URL — o plano de usar Vercel não muda nada
do que já foi decidido aqui, só confirma que precisávamos mesmo sair do SQLite:
Vercel roda o processo do Node de forma efêmera, sem disco persistente, e um
arquivo `.db` não sobreviveria a isso de jeito nenhum.

**Trocar de motor é maior do que redesenhar tabela — vira bloco próprio.**
SQLite é síncrono, Postgres é assíncrono; a troca toca a leitura e escrita de
toda rota. Por isso o antigo "Bloco 1" virou dois: primeiro provar que tudo
funciona igual rodando em Postgres (Bloco 1), depois desenhar multiempresa por
cima (Bloco 2). Misturar os dois riscos na mesma entrega dificultaria achar a
causa se algo quebrar.

**Apps nativos entram no escopo, além do site responsivo.** Recomendação de
caminho técnico: empacotar o mesmo código web (site do cliente e painel da
equipe) com **Capacitor**, em vez de reescrever em React Native. Reaproveita
quase tudo que os blocos de site e painel vão construir e ainda dá ícone,
splash screen e notificação push nativa. Decisão final de tecnologia fica para
quando chegarmos no bloco de apps — o de agora é só travar que existe esse
destino, para as telas já nascerem pensando nisso (nada de gesto ou interação
que só funcione com mouse).

**Duas áreas, dois bundles — dentro de cada empresa.** Site do cliente e painel
da equipe deixam de compartilhar build. Vite com duas entradas (`index.html` e
`painel.html`), pasta `shared/` para o que é comum. O site só fala com
`/api/publico/*` e nunca carrega token — isso encerra o item 1 do CLAUDE.md, que
hoje impede publicar na internet.

**Dentro de cada empresa, vários usuários com papel — nunca "a dona loga".** A
tabela `users` (Bloco 0) já tem a coluna `papel`; falta o significado de cada
um. Três papéis para começar, com regra concreta, não só nome:

- **Dono** — vê e edita tudo, inclusive financeiro e Aparência (Bloco 6).
- **Gerente** — opera o dia a dia: agenda de qualquer profissional, cadastros,
  financeiro. Não edita a aparência do site.
- **Funcionário** — só a própria agenda. **Não edita o site nem a aparência
  (Bloco 6)**, e **não bloqueia horário de outro profissional** (Bloco 0,
  tabela `blocks`) — só o próprio.

Cada regra dessas precisa existir tanto na tela (esconder o que não pode) quanto
na rota (recusar mesmo se a chamada chegar direto) — esconder botão não é
controle de acesso. Entra no Bloco 3 (login e permissão) e informa as telas do
Bloco 7 (painel).

**Toda tela nova nasce pensando em rodar dentro de app (Capacitor), não só no
navegador.** Não é só o bloco de apps nativos — é uma restrição que vale desde
já para o site (Bloco 4) e o painel (Bloco 7): nada de interação que dependa só
de mouse (hover, botão direito), alvo de toque com tamanho confortável, layout
que não dependa da barra de endereço do navegador para orientação. Embalar no
fim é mais barato se a tela já nasce assim; é bem mais caro descobrir isso só
no bloco de apps nativos.

**Cliente entra com Google — como conveniência, não como identidade.** O login
do Google devolve id, e-mail, nome e foto. **Não devolve telefone nem nascimento**:
esses campos exigem escopos sensíveis (`user.phonenumbers.read`,
`user.birthday.read`), que passam por revisão do Google e, mesmo aprovados, só
trazem o que a pessoa preencheu no perfil — quase sempre vazio. O telefone segue
sendo a identidade: chave única em `clients.fone`, canal do WhatsApp, base do CRM.
Login é gratuito e ilimitado. Quem não quiser logar continua agendando só com o
WhatsApp; o login nunca vira pedágio, senão perde-se agendamento.

**A autenticação Google mora num domínio só: o nosso.** O Google exige URL de
redirecionamento cadastrada. Com um deploy por cliente em domínio próprio, cada
empresa teria de criar o próprio projeto no Google Cloud — inviável. Existe um
host de autenticação central que recebe o login e devolve para o site da
empresa certa.

**Marca vem do banco, não do CSS.** As cores viram variáveis CSS injetadas em
runtime a partir da config da empresa. Um CSS, N marcas. Nada de rebuild por
cliente.

**Imagens em disco no MVP, uma pasta por empresa — repensar junto com a nuvem.**
`server/uploads/<slug>/` servido como estático funciona enquanto for um único
processo com disco persistente. No dia em que o Bloco 1 definir onde o Node
roda, vale conferir se esse provedor mantém disco entre deploys; se não mantiver,
a imagem vai direto para storage de objeto (S3, R2, ou o storage do próprio
provedor de banco) nesse mesmo bloco, não depois.

**Vocabulário é configurável.** "Profissional" vira o que o negócio chamar
(barbeiro, terapeuta, mecânico). Nome de tabela continua em inglês; o que muda é
o rótulo na tela.

## Blocos

### Bloco 0 — Migrations e fundação de dados ✅ concluído
Migrations versionadas, tabelas `units`, `blocks` e `users`, colunas de foto,
preço e vínculo Google, config em JSON. **O que ficou implementado está descrito
em `ARQUITETURA.md`** — aqui fica só o que isso significa para o que vem a
seguir.

**O que sobrevive à troca de motor (Bloco 1):** a forma das tabelas e o formato
da config em JSON. **O que não sobrevive:** o SQL específico do SQLite
(`PRAGMA`, tipos), a forma síncrona de acessar o banco em `db.js` e a coluna
`tenant_id` como está — o Bloco 2 a refaz com Row-Level Security.

### Bloco 1 — Trocar o motor: SQLite → Postgres ✅ concluído
Só troca de motor, ainda sem multiempresa. O que ficou implementado está em
`ARQUITETURA.md`.

- [x] PostgreSQL 17 local (winget), rodando como serviço do Windows — mesma
      versão que Neon e Supabase rodam, então local e produção não divergem
- [x] Esquema portado para dialeto Postgres, consolidado numa migration só
      (as duas do SQLite não valia carregar: metade era reconstrução de tabela,
      exigência que só o SQLite tinha)
- [x] Migrations agora versionadas na tabela `schema_migrations`, não em
      `PRAGMA user_version`; rodam no boot da API
- [x] `db.js`, as 6 rotas, os jobs e o seed reescritos para a API assíncrona do
      `pg` — 122 chamadas ao banco
- [x] Pool de conexões
- [x] `DATABASE_URL` no `.env`; trocar local ↔ gerenciado é essa linha só
- [x] `npm run reset` recusa rodar se a URL não for localhost

**Quatro coisas que o SQLite escondia e apareceram na troca:**

1. `LIKE` do Postgres diferencia maiúscula de minúscula. A busca de clientes
   passou a usar `ILIKE`, senão "amanda" não acharia "Amanda".
2. `IS NOT ?` é sintaxe de SQLite. Virou `IS DISTINCT FROM`.
3. A conferência de conflito de horário estava **fora** da transação, apesar do
   comentário afirmar que estava dentro. Com um escritor só isso passava; com
   pool de conexões vira corrida real. Agora está dentro de verdade.
4. Express 4 não captura erro em handler `async` — antes nada era assíncrono, e
   o problema não existia. Todo handler passa por `lib/rota.js` agora.

**Ainda em aberto deste bloco:** decidir onde `server/uploads/` vive quando
escolhermos a hospedagem do Node. Não bloqueia nada até o Bloco 6.

### Bloco 2 — Multiempresa dentro do Postgres
Antigo "Bloco 1" de banco por empresa, redesenhado para o motor novo. Agora é
mais barato: tudo num banco só, `tenant_id` mais política de segurança.

- [ ] `tenant_id` em toda tabela de negócio; índice composto com a chave
      primária de cada uma
- [ ] Row-Level Security: política por tabela que só libera linha da empresa da
      conexão atual — o banco recusa mesmo se uma rota esquecer o filtro
- [ ] Tabela `tenants` (id, slug, domínio, nome, plano, status, criado_em) —
      pode viver num schema `plataforma` dentro do mesmo banco
- [ ] Tabela `plataforma_usuarios` (login da nossa equipe, papel) e log de
      auditoria das ações administrativas
- [ ] `lib/tenant.js` passa a resolver a empresa por slug/subdomínio e a
      configurar a sessão do Postgres para aquele `tenant_id`
- [ ] `server/uploads/<slug>/` (ou equivalente no storage escolhido) — imagem de
      uma empresa isolada da de outra

### Bloco 3 — Separação das áreas e autenticação
- [ ] Duas entradas no Vite; `App.jsx` (1269 linhas) quebrado em `site/`, `painel/`, `shared/`
- [ ] `/api/publico/*` passa a servir tudo que o site precisa (hoje ele usa `/api/estado`, que exige token)
- [ ] Login real: argon2 e sessão em cookie httpOnly, substituindo o `ADMIN_TOKEN` único
- [ ] Middleware que resolve a empresa pela URL e configura a conexão para o
      `tenant_id` certo (Bloco 2)
- [ ] Sessão desenhada para dois públicos desde já: equipe e cliente

### Bloco 4 — Site do cliente (o visual)
Referência: `esteticalaurafaust.ageenda.com.br`. Mobile-first — quase todo
agendamento sai do celular, e este é um dos dois candidatos a virar app nativo
no bloco de apps nativos.

- [ ] Design system: tokens de cor/espaço/tipografia lendo a config da empresa
- [ ] Capa + logo + nome + CTA "Agende seu horário"
- [ ] Serviços por categoria: foto, nome, descrição, preço, duração, botão próprio
- [ ] Fluxo de agendamento em passos: serviço → profissional → data → horário → WhatsApp → confirmação
- [ ] Blocos de localização com mapa, Instagram, formas de pagamento, rodapé
- [ ] PWA instalável (manifest + ícone da empresa)

### Bloco 5 — Área do cliente (login Google)
Único bloco sem dependente: nada mais quebra se ele deslizar para depois.
O login em si é pequeno; o custo está no vínculo de conta e nas telas.

- [ ] Entrar com Google no site (escopos básicos apenas — nada de sensível)
- [ ] Vínculo de conta: casar Google com ficha existente sem duplicar cliente
- [ ] "Meus agendamentos": histórico, remarcar, cancelar com política
- [ ] Primeiro acesso ainda pede telefone e nascimento uma vez
- [ ] Agendar sem login continua funcionando, lado a lado
- [ ] LGPD: e-mail e foto entram na mesma lógica de `optin`

### Bloco 6 — Personalização pela própria empresa
- [ ] Aba "Aparência" no painel: cores, logo, capa, textos, vocabulário
- [ ] Upload de imagens (logo, capa, foto de serviço) com recorte e limite de tamanho
- [ ] Pré-visualização do site ao lado da edição
- [ ] Alternar o que aparece: preço, duração, escolha de profissional, avaliações

### Bloco 7 — Painel da equipe
Segundo candidato a app nativo. A imagem de referência que você trouxe (menu do
painel de uma empresa real, aberto no Safari do celular) mostra uma estrutura
que vale seguir de perto: **Painel, Financeiro, Calendário, Agendamentos,
Horários bloqueados**, depois **Cadastros** (Serviços, Profissionais, Clientes,
Unidades, Formulários) e **Configurações** (Mensagens, Configurações,
Integrações, Logs, Configurar App/Website).

- [ ] Shell com navegação lateral e identidade própria (não é o site)
- [ ] Agenda: colunas por profissional, blocos proporcionais, arrastar para remarcar
- [ ] Bloqueio de horário na agenda (almoço, folga, feriado) integrado ao `availability.js`
- [ ] Cadastro de unidades; profissional e serviço vinculados a unidade
- [ ] Cadastros redesenhados: serviços, equipe com jornada, clientes
- [ ] Financeiro: ticket médio, faltas, ranking, comissões
- [ ] Formulários: intake customizável por serviço (ex. anamnese de estética)
- [ ] Integrações: chaves de API / webhooks para ferramentas externas da empresa
- [ ] Logs: auditoria de quem fez o quê no painel

### Bloco 8 — White-label de verdade
- [ ] Varrer e remover vocabulário de estética do código e das telas
- [ ] Seed genérico + seed do estúdio como exemplo
- [ ] Assistente de primeira configuração (o negócio se cadastra e escolhe o ramo)
- [ ] Templates de WhatsApp por ramo

### Bloco 9 — Provisionamento self-service
Antes ("multi-tenant operacional") envolvia criar arquivo e rodar migration por
empresa. Com o Bloco 2 já pronto, cadastrar empresa nova é uma linha na tabela
`tenants` — este bloco é sobre expor isso sem depender de nós.

- [ ] Resolver a empresa pelo subdomínio
- [ ] Cadastro self-service: formulário público cria a linha em `tenants` e a
      empresa já começa a configurar sozinha
- [ ] Isolamento entre empresas coberto por teste automatizado (duas empresas,
      confirma que uma nunca vê a outra mesmo pedindo direto)

### Bloco 10 — Painel da plataforma (nosso back-office)
Não existe hoje nenhuma versão disto. Interface só nossa, separada do painel de
cada empresa e do site — fala com o schema `plataforma` e, quando precisa dar
suporte, consulta o `tenant_id` de uma empresa específica.

- [ ] Login da nossa equipe, à parte de qualquer login de empresa
- [ ] Lista de empresas: plano, status, criada em, uso no mês (agendamentos)
- [ ] Suspender / reativar uma empresa
- [ ] Métricas agregadas da plataforma — agora um `GROUP BY` direto, sem abrir
      banco por banco
- [ ] Acesso de suporte a uma empresa específica, sempre com registro em log
- [ ] Responsivo mobile + web; sem necessidade de app nativo (uso só interno)

### Bloco 11 — Apps nativos (iOS / Android)
Por último de propósito: empacotar um site que ainda está mudando de forma
(Blocos 4, 6, 7) é retrabalho a cada tela nova. Faz sentido depois que a versão
web estiver estável.

- [ ] Empacotar site do cliente e painel da equipe com Capacitor (reaproveita o
      código React quase inteiro) — confirmar essa escolha frente a React
      Native quando chegar aqui
- [ ] Notificação push nativa como reforço do lembrete — nunca substituindo o
      WhatsApp, porque nem toda cliente instala o app
- [ ] Cadastro de desenvolvedor na Apple e no Google, ícones e telas de loja
- [ ] Revisão da Apple (mais demorada e mais estrita que a do Google)

## Importante para produção

Lista viva. **Nada aqui bloqueia o desenvolvimento local**, mas cada item vira
problema real no dia em que houver cliente de verdade acessando. Ao terminar
qualquer bloco, pergunte se surgiu item novo para cá.

### Segredos e acesso

- [ ] **`ADMIN_TOKEN` vazio deixa o painel sem senha.** Hoje é assim de
      propósito e a API avisa no boot. Nunca publicar assim — o Bloco 3
      substitui por login de verdade.
- [ ] **A senha do Postgres local é `vitaldev`**, escrita em `server/.env`.
      É senha de desenvolvimento; em produção vem do cofre de variáveis do
      provedor, nunca de arquivo.
- [ ] **O front ainda embute o token do painel no bundle.** Enquanto o Bloco 3
      não separar as áreas, publicar o site expõe o acesso ao painel.
- [ ] `CORS_ORIGIN` precisa apontar para o domínio real, não `localhost`.
- [ ] Conferir que nenhum log imprime a `DATABASE_URL` inteira (o boot já
      mascara a senha — manter assim ao mexer nele).

### Banco

- [ ] **Migrations rodam no boot da API.** Com uma instância só, tudo bem. Com
      várias subindo ao mesmo tempo (o normal em nuvem), todas tentam migrar
      juntas. Antes do primeiro deploy com mais de uma instância, pôr um
      *advisory lock* do Postgres em volta do runner, ou tirar a migration do
      boot e rodar como passo separado do deploy.
- [ ] **Conexões esgotam rápido em serverless.** Cada função Vercel abre o
      próprio pool; provedores gerenciados têm limite baixo de conexões. Usar a
      *connection string* com pooler (Neon e Supabase oferecem uma) e reduzir o
      tamanho do pool.
- [ ] **TLS obrigatório no gerenciado.** `db.js` já liga sozinho quando a URL
      não é localhost; conferir se o provedor exige certificado verificado
      (hoje está `rejectUnauthorized: false`).
- [ ] **Backup.** O gerenciado faz sozinho; confirmar a frequência e, mais
      importante, **testar uma restauração** antes de ter dado real.
- [ ] `npm run reset` derruba o schema inteiro. Já recusa rodar fora de
      localhost — manter essa trava ao mexer no script.

### Hospedagem

- [ ] **Decidir onde `server/uploads/` vive.** Vercel apaga o disco a cada
      deploy: se a hospedagem do Node for efêmera, as imagens precisam ir para
      storage de objeto (S3, R2, ou o storage do próprio provedor de banco).
      Pendência herdada do Bloco 1; vira bloqueio no Bloco 6.
- [ ] **Fuso do servidor.** O código trata data e hora como texto justamente
      para não depender disso, mas os jobs de mensagem usam `TZ_ESTUDIO`.
      Conferir se o provedor roda em UTC e se a variável está definida.
- [ ] **Os jobs de cron rodam dentro do processo da API.** Com várias
      instâncias, todas disparam a mesma fila. O `dedupe_key` evita mensagem
      duplicada, mas o trabalho é repetido — avaliar mover para um agendador
      externo.

### Dados pessoais

- [ ] A partir do primeiro cliente real, a base tem nome, telefone, endereço e
      nascimento de pessoas reais. As regras de LGPD que hoje são teoria
      (`optin`, transacional vs. marketing) passam a valer de fato — ver
      `ARQUITETURA.md`.
- [ ] Definir por quanto tempo guardar histórico de quem não é mais cliente.
- [ ] Ter um caminho para exportar e apagar os dados de uma empresa que sair da
      plataforma.

## Fora de escopo por enquanto

Pagamento online, webhook de resposta do WhatsApp e API oficial da Meta seguem
como estão (listados no fim do `CLAUDE.md`) — entram depois que a base
white-label estiver de pé.

Testes do motor de horários (`lib/availability.js`) sobem de prioridade no
Bloco 7: bloqueio de horário e unidades mexem exatamente na parte que quebra
silencioso.
