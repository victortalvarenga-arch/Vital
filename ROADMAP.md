# Roteiro

**O negócio: a Vital desenvolve este software e vende para várias
empresas-cliente.** Cada salão, cada barbearia é um cliente da Vital, não o
produto final. É produto de assinatura, hospedado por nós, operado por muitos
negócios ao mesmo tempo. Toda vez que uma decisão nova aparecer, a pergunta é
"isso funciona para uma Vital com 200 clientes, ou só para um negócio só?" — a
segunda resposta não serve.

**Onde estamos.** A base multiempresa está de pé: banco isolado por
Row-Level Security, empresa nascendo sozinha pelo cadastro, três interfaces, e o
back-office para administrar quem assina. O que falta para virar negócio é
cobrança — hoje `plano` é texto livre, sem preço nem ciclo.

Este arquivo é o mapa de execução. Cada bloco é entregável e testável sozinho.
Marque o que concluir; a próxima sessão retoma daqui. As três seções do fim —
**Achados**, **Importante para produção** e **Fora de escopo** — são listas
vivas, e valem tanto quanto os blocos.

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

**Postgres, um banco só, isolado por Row-Level Security.** ✅ Implementado nos
Blocos 1 e 2 — o desenho está em `ARQUITETURA.md`, seção "Isolamento entre
empresas".

Fica aqui só o porquê da escolha, que é decisão de produto: SQLite trava a
escrita por arquivo, o que não combina com vários processos da API rodando ao
mesmo tempo nem com hospedagem de disco temporário (Railway, Render e Vercel
apagam o disco a cada deploy). Postgres foi feito para isso e todo provedor de
nuvem sabe hospedar. E o modelo de um banco só deixa barato o que a Vital mais
vai fazer: cadastrar empresa nova é um `INSERT`, e relatório da plataforma é um
`GROUP BY`, não abrir banco por banco.

**Neon desde já, também para desenvolver — não há mais Postgres local.**
Decisão de set/2026, revendo a de manter um Postgres em cada máquina. O motivo:
banco local por máquina significa versão de esquema e dados divergindo entre
computadores (o cenário do `seed` só é igual se todo mundo rodar o mesmo `reset`
na mesma hora). Um banco só, na nuvem, resolve isso sem custo: o tier gratuito
da Neon basta para desenvolver e testar, é o mesmo motor (mesmo SQL, mesmo driver
`pg`), e o que muda entre ambientes continua sendo uma linha do `.env`, nunca
código. O desenvolvimento usa um *branch* descartável (`dev`); o de produção
(`production`) fica intocado até o lançamento. O preço: a primeira consulta depois
de uns 5 minutos parado espera o compute acordar (~1 s), e a suíte de testes leva
uns 4 minutos pela rede em vez de segundos. Como isso funciona por dentro (conexão
direta, trava do `reset`): `ARQUITETURA.md`.

**Vercel hospeda o site e a API, não o banco.** Vercel é ótimo para domínio,
rotas e certificado — mas não guarda Postgres rodando dentro dele; até o
recurso "Vercel Postgres" é, por baixo, um Neon integrado. Ou seja: Postgres
gerenciado (Neon/Supabase) e hospedagem do app (Vercel) são duas contas
diferentes que se conectam por uma URL — o plano de usar Vercel não muda nada
do que já foi decidido aqui, só confirma que precisávamos mesmo sair do SQLite:
Vercel roda o processo do Node de forma efêmera, sem disco persistente, e um
arquivo `.db` não sobreviveria a isso de jeito nenhum.

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
`/api/publico/*` e nunca carrega credencial — era o que impedia publicar na
internet. Hoje são três bundles: a página da Vital entrou no Bloco 10.

**Dentro de cada empresa, vários usuários com papel — nunca "a dona loga".** A
tabela `users` (Bloco 0) já tem a coluna `papel`; falta o significado de cada
um. Três papéis para começar, com regra concreta, não só nome:

- **Dono** — vê e edita tudo, inclusive financeiro e a configuração do site.
- **Funcionário** — a própria agenda e a própria produção. Não edita a
  configuração do site nem cadastros, e não bloqueia horário de outro
  profissional (tabela `blocks`) — só o próprio.

Implementado no Bloco 3b. O "gerente" foi removido: ver `ARQUITETURA.md`.

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

**Imagens em disco por padrão, bucket R2 quando configurado — decidido.**
`server/uploads/<slug>/` servido como estático continua sendo o caminho sem
nenhuma credencial de nuvem (desenvolvimento). `routes/uploads.js` já tem o
adaptador para um bucket compatível com S3 (Cloudflare R2); falta só ativar
as variáveis no ambiente de deploy — ver "Hospedagem", acima, e
ARQUITETURA.md, "Imagens".

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

- [x] PostgreSQL 17 local (winget), rodando como serviço do Windows — hoje o
      desenvolvimento usa a Neon, ver o início deste arquivo — mesma
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

### Bloco 2 — Multiempresa dentro do Postgres ✅ concluído
O que ficou implementado está em `ARQUITETURA.md`, seção "Isolamento entre
empresas".

- [x] `tenant_id` em toda tabela de negócio, com índice começando por ele —
      sem isso o RLS fica lento, porque a política entra como filtro em tudo
- [x] Row-Level Security com `USING` e `WITH CHECK` nas 10 tabelas de negócio
- [x] Papel `vital_app`, sem `SUPERUSER` e sem `BYPASSRLS` — sem isso o RLS
      seria decorativo, porque superusuário ignora política
- [x] `FORCE ROW LEVEL SECURITY`: nem o dono da tabela escapa
- [x] Schema `plataforma` com `tenants` (agora com plano e status),
      `usuarios` (nossa equipe) e `auditoria`
- [x] `lib/contexto.js` + middleware `comEmpresa()`: a empresa vive na conexão,
      não na consulta — nenhuma das 122 consultas precisou mudar
- [x] `tenant_id` com default `current_setting('app.tenant_id')`: preenche
      sozinho, e sem empresa definida a gravação falha em vez de vazar
- [x] Jobs de cron percorrem as empresas ativas uma a uma

**Provado por teste, não por leitura:** empresa nova nasce vazia; `SELECT *
FROM clients` sem filtro nenhum devolve 0 linhas para quem não tem dado;
escrita de uma não aparece na outra; tentar gravar no nome de outra empresa é
recusado pelo banco; conexão sem empresa não devolve nada; e a conexão não leva
a empresa de volta ao pool. 11 casos, todos passando.

**Ainda em aberto deste bloco:** `server/uploads/<slug>/` — depende de decidir
a hospedagem, e só vira bloqueio no Bloco 6.

### Bloco 3 — Separação das áreas ✅ concluído (a autenticação virou o Bloco 3b)
A metade que a UI precisava está feita. O login não era pré-requisito de nada
visual, então foi separado para não atrasar a tela.

- [x] Duas entradas no Vite; `App.jsx` de 1269 linhas quebrado em `site/`,
      `painel/` e `shared/` — o site virou um bundle de ~20 kB que não carrega
      mais o financeiro nem a credencial do painel
- [x] `/api/publico/*` passa a servir tudo que o site precisa: vitrine com
      marca, textos e vocabulário, mais `/publico/horarios`
- [x] Middleware que resolve a empresa e abre a conexão certa (veio do Bloco 2)

### Bloco 3b — Autenticação de verdade ✅ concluído
Detalhes em `ARQUITETURA.md`, seção "Autenticação e papéis".

- [x] Login com argon2id e sessão em cookie `httpOnly`; o `ADMIN_TOKEN` saiu
- [x] Sessão em tabela, não JWT — a Vital precisa conseguir derrubar acesso
- [x] Dois papéis: dono vê o negócio inteiro; funcionário vê o que é dele —
      a própria agenda e a própria produção, incluindo comissão
- [x] Cada regra vale na tela **e** na rota
- [x] Primeiro acesso aberto, fechando sozinho quando surge o primeiro usuário
- [x] Rotas para o dono convidar e editar a equipe do painel
- [x] Tela "Acesso ao painel": criar, editar, trocar senha, ativar e desativar
- [x] Travas contra se trancar para fora: não dá para desativar, mudar o próprio
      nível nem apagar a própria conta, e sempre sobra um dono ativo
- [x] Desativar **e** apagar: desativar guarda quem era, para quem pode voltar;
      apagar serve para conta criada por engano. Atendimento e comissão não vão
      junto — apontam para `staff`, não para `users`
- [ ] "Esqueci minha senha" — depende de envio de e-mail, que o projeto ainda
      não tem. Enquanto isso, o dono redefine pela rota de edição.

**Provado por teste, não por leitura:** 25 casos. Sem login, as seis rotas do
painel recusam e o site público continua aberto. Senha errada e e-mail
inexistente dão a mesma resposta, e a senha é conferida mesmo sem usuário, para
o tempo de resposta não denunciar quais e-mails existem. A funcionária recebe
403 em financeiro, config, criação de serviço, exclusão de profissional, upload
e adicionais — mas continua vendo agenda e clientes. Sair encerra de verdade, e
cookie inventado não entra.

### Bloco 4 — Site do cliente ✅ concluído
Referência: `esteticalaurafaust.ageenda.com.br`. O que ficou está em
`ARQUITETURA.md`, seção "As duas telas".

- [x] Design system com a marca vinda da config, aplicada em runtime
- [x] Capa, logo, nome, endereço com link para o mapa e chamada para agendar
- [x] Serviços agrupados por categoria: cartões primeiro, lista depois do toque
- [x] Foto, descrição, preço e duração em cada serviço, com botão próprio
- [x] Agendamento em passos: serviço → profissional → dia → hora → WhatsApp
- [x] Horários vindos do servidor, não adivinhados pelo front
- [x] Passo do profissional se pula sozinho quando só há uma pessoa
- [x] Rodapé com mapa, WhatsApp, Instagram e formas de pagamento
- [x] Mobile primeiro: alvos de toque de 48px, `font-size: 16px` nos campos
      para o iOS não dar zoom, área segura do iPhone respeitada
- [ ] PWA instalável (manifest + ícone da empresa) — falta

**Verificado de ponta a ponta:** o fluxo público inteiro, incluindo que a
vitrine não vaza cliente, financeiro, chave Pix nem telefone da equipe, que o
mesmo horário é recusado duas vezes e que horário vendido some da grade.

### Bloco 4b — Confirmar que o WhatsApp é mesmo da pessoa
Hoje a cliente digita o número e, se houver cadastro, a tela mostra o primeiro
nome e pede confirmação. Isso pega o erro de digitação, mas não impede quem
quiser agendar de propósito no cadastro alheio — e expõe o primeiro nome de
qualquer número que alguém digite.

- [ ] Código de 4 dígitos por WhatsApp no primeiro agendamento de cada número
- [ ] Decidir quando cobrar o código: toda vez encarece e atrapalha; só no
      primeiro agendamento do número é o equilíbrio provável
- [ ] Custa por mensagem na API oficial da Meta, e no modo manual não é
      automático — por isso não foi feito junto do Bloco 4
- [ ] **Pesar contra o Bloco 5 antes de fazer.** Quem entra com Google não
      digita telefone, então não erra: o código por WhatsApp só é necessário
      para quem agenda sem login. Se o Google cobrir a maioria, talvez este
      bloco inteiro não se pague.

### Bloco 5 — Área do cliente (login Google)
Único bloco sem dependente: nada mais quebra se ele deslizar para depois.
O login em si é pequeno; o custo está no vínculo de conta e nas telas.

**O ganho principal não é economizar campo — é a identidade.** Hoje a cliente
se identifica digitando o WhatsApp, e digitar errado agenda no cadastro de
outra pessoa (ver Bloco 4b). Entrando com Google, quem volta **não digita
nada**: a conta responde quem ela é, e o número errado deixa de existir como
problema. Isso torna o Bloco 4b desnecessário para quem usa Google — e ele
continua valendo para quem não usa.

**Oferecer no começo do agendamento, nunca barrar a entrada no site.** Exigir
login para ver preço ou marcar horário perde cliente — é a mesma razão pela
qual não há cadastro hoje. O desenho é: ao abrir a janela de agendamento,
"Entrar com Google" em destaque e "continuar sem entrar" ao lado, com o mesmo
peso visual do resto da tela.

**Fluxo pretendido**

| | Primeira vez | Voltando |
|---|---|---|
| Google traz | nome, e-mail, foto | tudo do cadastro |
| Ainda perguntamos | WhatsApp e nascimento | nada |
| Sem Google | WhatsApp, nome e nascimento | só o WhatsApp |

- [ ] Entrar com Google no site (escopos básicos apenas — nada de sensível)
- [ ] **Google NÃO traz WhatsApp nem nascimento — conte com perguntar sempre.**
      Existem escopos para isso (`user.phonenumbers.read`,
      `user.birthday.read`), mas são sensíveis: passam por revisão do Google e,
      mesmo aprovados, só devolvem o que a pessoa preencheu no perfil — quase
      sempre vazio. Planejar como se viessem é planejar para uma tela que nunca
      aparece.
- [ ] Vínculo de conta: casar Google com ficha existente sem duplicar cliente.
      A chave continua sendo o telefone; o e-mail do Google entra como segundo
      identificador, não como substituto
- [ ] "Meus agendamentos": histórico, remarcar, cancelar com política
- [ ] Agendar sem login continua funcionando, lado a lado
- [ ] LGPD: e-mail e foto entram na mesma lógica de `optin`

### Bloco 6 — Personalização pela própria empresa ✅ concluído
Veio junto com o site, porque configurar sem ter o que configurar não fazia
sentido. Detalhes em `ARQUITETURA.md`.

- [x] Aba **Site da cliente** no painel: identidade, cor, logo, capa, textos,
      contato, o que exibir e regras da agenda
- [x] Upload de imagem com redução no navegador antes de subir; nome do arquivo
      gerado no servidor e pasta por empresa
- [x] Foto por serviço, categoria como texto livre (não lista fixa no código) e
      interruptor de "mostrar preço" por serviço
- [x] Interruptores gerais: preço, duração, fotos, categorias, escolha de
      profissional
- [ ] Pré-visualização do site ao lado da edição — falta; hoje o botão "Abrir o
      site" resolve, em outra aba

**Resolve a pendência de `uploads/`** que vinha desde o Bloco 1: as imagens vão
para `server/uploads/<empresa>/`, servido pelo Express. Continua valendo o item
de produção — se a hospedagem do Node apagar o disco entre deploys, isso vira
storage de objeto.

### Bloco 6b — Site: refinamento visual e agendamento em janela ✅ concluído
O desenho final está em `ARQUITETURA.md`, seção "As duas telas".

- [x] Agendamento em janela sobre a home, com Esc para fechar, foco preso
      dentro dela e a rolagem da página de trás travada
- [x] Três colunas: passo à esquerda, conteúdo no centro, resumo à direita.
      No celular vira uma coluna, com o resumo numa barra no rodapé que mostra
      o total e abre ao toque
- [x] Resumo ao vivo: profissional, serviço, data e hora, total
- [x] **Calendário por mês**, com navegação entre meses. Dia com vaga tem pista
      além da cor (preenchimento e negrito; passado e sem vaga apagados) — cor
      sozinha não serve a quem não a distingue. Data e horário na mesma tela,
      com estado vazio escrito e saída pelo WhatsApp (refeito em 2026-09-19;
      ver "As três telas" em `ARQUITETURA.md`)
- [x] Rota nova `/publico/dias-livres?mes=`, resolvendo o mês numa consulta só;
      dia a dia seriam trinta idas ao banco para pintar uma tela
- [x] Opção "qualquer profissional" no passo de escolha
- [x] Seção de serviços em grade de círculos, com a foto na frente do nome;
      inicial sobre a cor da marca quando não há foto
- [x] Recado opcional da cliente no agendamento, que chega ao painel
- [x] Animações discretas ao rolar, que somem inteiras com
      `prefers-reduced-motion`
- [x] **Instagram: só o link** (decidido em 2026-08-27 — ver abaixo). Superado
      em 2026-09-18: a grade existe, preenchida pela empresa no painel
- [ ] **Conectar a conta do Instagram** para a grade se atualizar sozinha.
      Adiado em 2026-09-18; roteiro completo abaixo, em "Próximo passo:
      conectar a conta". Começa fora do código: conta profissional da Laura e
      app na Meta (passos 1–6) — só depois disso há o que programar

**Verificado:** 8 casos no calendário, incluindo o que mais importa — lotar
todos os horários de um dia faz ele sumir do calendário, ou seja, calendário e
lista de horas não divergem.

**O que a Meta mudou, para quando a faixa de fotos voltar à mesa.** A API que
fazia isso de forma simples (Basic Display) foi **desligada em dezembro de
2024**. Hoje só existe caminho oficial pela Graph API / Instagram Login, e ele
exige perfil **Profissional** (comercial ou criador) — perfil pessoal não é mais
acessível por API nenhuma. Sendo multiempresa, isso vira um cadastro na Meta e
um token para renovar por cliente. **Caminho barato quando for a hora**: a
empresa sobe algumas fotos pelo painel, onde o upload já existe. Fica parecido
visualmente, sem amarrar a plataforma à Meta; só não atualiza sozinho.

**A faixa voltou à mesa em 2026-09-18**: a cliente pediu o grid do site de
referência, com os 6 últimos posts entrando sozinhos. **Feito no mesmo dia: a
estrutura** — `config.instagramPosts`, a vitrine que a filtra, a grade no site
e a tela do painel onde a empresa sobe as fotos (detalhe em `ARQUITETURA.md`).
**Em aberto: a conexão automática**, que preencheria essa mesma lista sozinha.
O que ela exige, levantado nessa conversa:

- **Da cliente:** conta Instagram Profissional (comercial ou criador). Perfil
  pessoal não conecta, e a mudança é ela quem faz, no app.
- **Da Vital, uma vez:** um app no Meta for Developers com o produto
  "Instagram API with Instagram Login" (o que não exige Página do Facebook).
  Enquanto o app não passa pela **App Review** da permissão
  `instagram_business_basic`, só contas adicionadas como *tester* do app
  conseguem conectar — serve para a Laura pré-lançamento; para qualquer
  empresa conectar sozinha, a revisão é obrigatória, e pode pedir
  verificação da empresa Vital.
- **No produto:** botão "Conectar Instagram" no painel (Configurações → Site)
  que manda para o OAuth da Meta; rota de retorno no servidor que troca o
  código por um **token longo (60 dias)** e o guarda por empresa — token é
  segredo, então **não** vai em `tenants.config` (a vitrine lê essa coluna;
  precisa de tabela ou coluna própria, nunca exposta pela API pública); job
  que renova o token antes de vencer (a renovação só funciona com token ainda
  válido — vencido, a empresa reconecta); busca dos 6 últimos posts
  (`/me/media` com `media_url`, `permalink`, `media_type`) com cache no
  servidor de ~1h, porque o site não pode bater na Meta a cada visita. As
  URLs de mídia da Meta expiram; o cache precisa refazer a busca, não guardar
  a URL por dias.
- **No site e na vitrine: nada.** O job escreve em `config.instagramPosts`
  (`imagem`, `link`, `tipo: 'video'` com a `thumbnail_url` quando for vídeo)
  e a grade que já existe mostra. A tela do painel passa a exibir o que veio
  da conta em vez de pedir upload — e um jeito de desconectar.

O caminho manual que está no ar não depende de revisão de app nem de conta
profissional; só não atualiza sozinho. Fica como está para toda empresa que
não conectar.

#### Próximo passo: conectar a conta — o roteiro (anotado em 2026-09-18, adiado)

**Custo: zero da Meta.** Sem cobrança por chamada, conta de desenvolvedor,
revisão do app e verificação da empresa gratuitas. O que custa é tempo — a
burocracia da Meta e a programação da conexão. Limite de chamadas folgado
para uma busca por hora por empresa. Fontes conferidas na data:
[Instagram API with Instagram Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login),
[Business Login for Instagram](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login).

Duas fases. A primeira já resolve a Laura sem esperar revisão da Meta; a
segunda só faz sentido quando houver uma segunda empresa querendo isso.

**Fase A — conectar a Laura (dias).**

*Ela, no app do Instagram:*
1. Conferir se a conta é **Profissional** (Comercial ou Criador). Se pessoal:
   Configurações → Tipo de conta e ferramentas → Mudar para conta profissional.
   Gratuito; não exige página no Facebook.

*Nós, no Meta for Developers (uns 30 minutos):*
2. Conta em <https://developers.facebook.com> com o login da Meta (pede
   verificação em duas etapas).
3. **Criar app** → caso de uso "Gerenciar tudo no Instagram" (ou tipo Business)
   → produto **Instagram** → "Configuração da API com login comercial do
   Instagram".
4. Em *Instagram → Configuração da API com login comercial*, anotar o
   **Instagram App ID** e o **App Secret**, e preencher as três URLs exigidas:
   - *Redirect URI* — para onde a pessoa volta depois de autorizar. **HTTPS
     público** obrigatório (ex.: `https://api.vital.app/api/instagram/retorno`);
     localhost não serve. Para testar antes de ter servidor, um túnel
     (Cloudflare Tunnel ou ngrok).
   - *Deauthorize callback* e *Data deletion request* — duas rotas simples do
     nosso servidor (a criar junto com a conexão).
5. Em *Instagram → Funções → Testadores do Instagram*, adicionar o `@` da
   Laura. Ela aceita no app (Configurações → Site e apps → Convites de
   testador). **Como testadora, conecta sem App Review.**
6. App ID, App Secret e a URL pública vão no `server/.env` — nunca no Git.

*No código (depois dos passos acima):*
7. Botão "Conectar Instagram" em Configurações → Site → OAuth da Meta
   (`https://www.instagram.com/oauth/authorize`, escopo só
   `instagram_business_basic`) → rota de retorno troca o `code` por token
   curto (`api.instagram.com/oauth_token`) e este pelo **longo de 60 dias**
   (`graph.instagram.com/access_token`, `grant_type=ig_exchange_token`) →
   guarda por empresa, fora da `config` → job renova
   (`graph.instagram.com/refresh_access_token`, só com token válido e com
   mais de 24h) e busca `/me/media` a cada hora, escrevendo em
   `instagramPosts` → o site que já existe mostra. Mais: aviso no painel
   quando o token cair (troca de senha, revogação, conta voltou a pessoal),
   botão "Desconectar", e a tela passa a exibir o que veio da conta em vez de
   pedir upload.
8. Ela clica em conectar, uma vez.

**Fase B — qualquer empresa conectar sozinha (2 a 4 semanas).**
9. **Política de privacidade e termos de uso** publicados num endereço da
   Vital — a Meta exige o link.
10. **Verificação da empresa** no Gerenciador de Negócios da Meta: CNPJ e um
    documento (contrato social ou conta no nome da empresa). Gratuito; dias a
    semanas.
11. **App Review** pedindo *Acesso Avançado* só a `instagram_business_basic`
    (pedir mais atrasa): vídeo da tela com o fluxo inteiro (painel → conectar
    → grade no site), uma conta de teste e a descrição do uso ("exibir as
    últimas 6 publicações no site da empresa"). Rejeição na primeira tentativa
    é comum, normalmente por detalhe do vídeo ou do texto.
12. Aprovado, app em **modo Live**. Daí qualquer empresa conecta.

### Bloco 6c — Serviços adicionais ✅ concluído
Detalhes em `ARQUITETURA.md`.

- [x] Tabelas `service_addons`, `category_addons` e `appointment_addons`, com RLS
- [x] Adicional é um `service` comum marcado como extra — sem entidade nova
- [x] Cadastro no painel, por serviço **e** por categoria; o site oferece a união
- [x] Passo de adicionais no agendamento, opcional e pulável
- [x] Duração e valor somam os extras; `/horarios` e `/dias-livres` aceitam a
      lista, porque escolher extras muda o que cabe na agenda
- [x] Servidor confere a lista contra a oferta real e tira o preço do banco
- [x] Resumo da janela mostra os extras e o total
- [x] Painel exibe os extras: sinal no bloco da agenda e lista discriminada no
      detalhe do agendamento
- [x] Encaixe pelo painel oferece adicionais e combos, com duração e total
      calculados
- [x] O ranking do financeiro atribui cada extra ao próprio serviço, sem deixar
      de bater com o caixa
- [x] **Vender só como adicional**: `services.somente_adicional` tira o extra da
      vitrine e o recusa como serviço principal, sem confundir com arquivar

### Bloco 6d — Combos e promoções ✅ concluído
Detalhes e o porquê do modelo em `ARQUITETURA.md`.

- [x] Cadastro no painel: nome, serviços, preço do pacote, validade e chamada
- [x] Economia calculada sozinha, e mostrada enquanto a empresa decide o preço
- [x] Selo de promoção, preço cheio riscado e "economize R$ X" no site
- [x] Combo com validade some do site sozinho quando vence
- [x] Duração soma a de todos os serviços, limpeza junto
- [x] **Comissão**: o desconto é rateado na proporção do preço de tabela de cada
      serviço, entre todas as profissionais envolvidas; com uma pessoa só, ela
      absorve tudo. O rateio vira o `valor` de cada agendamento na venda, então
      o financeiro e o ranking por serviço já saem certos sem saber o que é
      combo — o problema que os adicionais ainda têm
- [x] Cancelar ou apagar um pedaço derruba o pacote inteiro
- [ ] Combo com mais de uma profissional: o rateio e o banco já suportam, falta
      a tela que deixa escolher quem faz cada serviço. Hoje o site vende com uma
      pessoa só, do começo ao fim
- [x] Encaixe de combo pelo painel, no mesmo formulário do serviço avulso
- [x] Foto própria do combo, com upload na tela de cadastro

### Bloco 7 — Painel da equipe
O shell já foi refeito no Bloco 4 (navegação lateral agrupada, gaveta no
celular). O que falta aqui são as telas em si e as capacidades novas.

Segundo candidato a app nativo. A imagem de referência que você trouxe (menu do
painel de uma empresa real, aberto no Safari do celular) mostra uma estrutura
que vale seguir de perto: **Painel, Financeiro, Calendário, Agendamentos,
Horários bloqueados**, depois **Cadastros** (Serviços, Profissionais, Clientes,
Unidades, Formulários) e **Configurações** (Mensagens, Configurações,
Integrações, Logs, Configurar App/Website).

- [x] Shell com navegação lateral e identidade própria — veio no Bloco 4
- [x] Agenda com colunas por profissional e blocos proporcionais à duração
- [x] **Arrastar para remarcar**, com toque e cursor. Ver `ARQUITETURA.md`
- [x] Agenda por semana, com os dias no eixo X e quem atende dentro do bloco
- [x] Bloqueio de horário na agenda (almoço, folga, feriado), integrado ao
      `availability.js`, ao calendário do site e à gravação. Funcionário fecha
      só a própria agenda; feriado da empresa é do dono. Ver `ARQUITETURA.md`.
- [x] Cadastro de unidades, com a profissional vinculada ao endereço e o site
      perguntando onde a cliente quer ser atendida. Ver `ARQUITETURA.md`
- [ ] Cadastros redesenhados: serviços, equipe com jornada, clientes
- [x] Financeiro: recebido, a receber, previsto do dia, ticket médio, faltas,
      ranking por serviço, comissões e formas de pagamento
- [x] Financeiro por período livre (7 dias, 30 dias, mês, mês passado) com
      comparação com o período anterior de mesmo tamanho
- [x] Formulários: intake customizável por serviço, respondido no site e no
      balcão, com a resposta presa ao atendimento. Ver `ARQUITETURA.md`
- [ ] Integrações: chaves de API / webhooks para ferramentas externas da empresa
- [x] Registro: quem fez o quê no painel, com o nome congelado e sem poder
      ser reescrito. Ver `ARQUITETURA.md`

### Bloco 8 — White-label de verdade
- [x] Varrer e remover vocabulário de estética do código e das telas
- [x] Seed genérico separado do estúdio de exemplo: empresa nasce por
      `lib/provisionar.js`, e `npm run seed -- --vazio` mostra como ela enxerga
      o sistema no primeiro dia
- [x] Assistente de primeira configuração: nome, ramo com vocabulário sugerido,
      e o primeiro atendente e serviço já vinculados
- [x] Textos de WhatsApp neutros em gênero e em ramo
- [ ] Variações de texto por ramo em cima dos neutros — o assistente já sabe o
      ramo, falta sugerir os textos

### Bloco 9 — Provisionamento self-service
Antes ("multi-tenant operacional") envolvia criar arquivo e rodar migration por
empresa. Com o Bloco 2 já pronto, cadastrar empresa nova é uma linha na tabela
`tenants` — este bloco é sobre expor isso sem depender de nós.

- [x] Resolver a empresa pelo subdomínio e por domínio próprio, com 404 para
      endereço de ninguém e 403 para empresa suspensa. Ver `ARQUITETURA.md`
- [x] Cadastro self-service pela API: `POST /api/cadastro` cria empresa,
      endereço e dono numa tacada, e o assistente continua no painel dela
- [x] **A tela do cadastro**, em `vital.html`: formulário de cinco campos, com o
      endereço conferido enquanto se digita o nome
- [x] Isolamento entre empresas coberto por teste automatizado — duas empresas
      de verdade, pedindo pelo id exato da outra, mais uma checagem estrutural
      de que toda tabela de negócio tem a política ligada e forçada. Achou dois
      vazamentos reais no primeiro dia: a config e o catálogo apontando sempre
      para a empresa padrão

### Bloco 10 — Painel da plataforma ✅ concluído
Terceiro bundle (`vital.html`), com a nossa marca. Detalhes em `ARQUITETURA.md`.

- [x] Login da nossa equipe, à parte de qualquer login de empresa: tabelas
      próprias e cookie de outro nome, então as duas sessões convivem no mesmo
      navegador sem se derrubar
- [x] **Lista de empresas-cliente** com nome, endereço, plano, status e desde
      quando
- [x] **Números por empresa** — clientes, equipe, serviços, agendamentos do mês
      — sem furar o isolamento: uma função do banco devolve **só contagens**
- [x] Totais da plataforma, inclusive quantas empresas nunca tiveram um
      agendamento, que é o número que diz se o produto pegou
- [x] Suspender / reativar, com efeito imediato no site e no painel da empresa
- [x] Registro de auditoria de tudo que a nossa equipe faz sobre uma empresa, e
      do nascimento de cada empresa. Empresas anteriores a este painel não têm
      registro de criação, e nenhum foi inventado para elas
- [x] Link direto para o site e o painel de cada empresa
- [x] Responsivo mobile + web
- [ ] **Receita recorrente.** Depende de haver cobrança: hoje `plano` é um texto
      livre, sem preço nem ciclo. Entra junto do pagamento
- [ ] **Acesso de suporte à empresa** — entrar no painel de um cliente para
      ajudar, com registro. A auditoria já existe; falta o caminho de entrada, e
      ele precisa ser desenhado com cuidado: é a única porta que atravessaria o
      isolamento de propósito
- [ ] Convidar mais gente para a equipe da Vital pela tela (o papel `suporte`
      já existe e já é respeitado; falta o formulário)

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

## Achados

Lista viva do que se percebe pelo caminho e não pertence a bloco nenhum: falha
encontrada, dívida deixada de propósito, coisa que só vai doer depois. **Entra
aqui na hora em que é notada**, mesmo sem plano de conserto — achado que fica só
na conversa se perde na próxima sessão.

Sai daqui quando é resolvido, ou quando vira item de um bloco.

### Banco

- [ ] **`sslmode=require` na URL do Neon faz o `pg` avisar em toda execução**
      que o modo vai mudar de semântica na próxima versão maior
      (`pg-connection-string` v3 / `pg` v9). Hoje `require` vale como
      `verify-full`; se o comportamento mudar, a conexão pode ficar mais frouxa
      sem ninguém perceber. Trocar por `sslmode=verify-full` explícito quando
      atualizar o `pg`, e conferir que `sslPara()` (`lib/ambiente.js`), que passa
      `rejectUnauthorized: false`, não anula a verificação.
- [ ] **O branch `dev` e o `production` da Neon não são distinguíveis pela URL
      que o código enxerga**, só pelo `VITAL_BANCO_DESCARTAVEL`. Se alguém
      copiar o `.env` de desenvolvimento para o servidor de produção, o `reset`
      volta a poder apagar o banco de verdade. Vale um segundo fecho — por
      exemplo, recusar a variável quando `NODE_ENV=production`.
- [ ] **`messages.dedupe_key` é UNIQUE global, sem `tenant_id`.** Funciona hoje
      porque os ids são aleatórios e não colidem entre empresas — mas é a única
      restrição do sistema que atravessa a fronteira, e um `ON CONFLICT DO
      NOTHING` em cima dela engoliria a mensagem de outra empresa em silêncio.
- [ ] **Tabela nova em `public` nasce com UPDATE e DELETE para a aplicação**, por
      causa do `ALTER DEFAULT PRIVILEGES` da migration 002. É o padrão certo para
      tabela de negócio e o errado para tabela que só cresce — `logs` precisou de
      um `REVOKE` explícito, e o teste é que pegou. Ao criar tabela de histórico,
      lembrar de revogar.
- [ ] `logs` cresce para sempre e nada a poda. Com uma empresa movimentada são
      milhares de linhas por mês. Decidir prazo de retenção antes de virar
      problema de espaço.
- [x] ~~`funil` cresce junto, e mais rápido que `logs`.~~ Resolvido na
      migration 016: o dia antigo vira uma linha em `funil_diario` e o cru sai,
      com a série histórica inteira preservada. O detalhe que o desenho
      escondia está em `ARQUITETURA.md` — um dia só fecha quando o
      "compareceu" dele parou de mudar.

### Produto

- [ ] Combo não pede formulário. São vários serviços, e cada um poderia pedir o
      seu — precisa decidir se pergunta a união de todos ou só o do primeiro.
      Menos urgente desde que a ficha saiu do site (2026-09-23): quem responde
      é a profissional, e ela vê o que cada serviço pede no painel.

- [ ] **Nada avisa que um atendimento está com a ficha pendente.** Desde que a
      anamnese saiu do site, todo agendamento online nasce sem ela, e a
      profissional só descobre abrindo o detalhe. Um marcador na agenda (ou no
      Resumo do dia) para quem tem ficha obrigatória por responder evitaria
      começar o atendimento sem saber de uma alergia. `formsDoServico()` já
      responde quais serviços pedem ficha.

- [ ] **O painel deixa cadastrar combo que ninguém faz inteiro, sem avisar.**
      Limpeza (só a Karen) + design (só a Bia) salva normalmente; a vitrine
      passou a esconder esse combo (2026-09-19), então a empresa cadastra a
      promoção e ela simplesmente não aparece no site, sem explicação. Falta
      `Combos.jsx` dizer, na hora de salvar, "ninguém da equipe faz todos os
      serviços deste pacote" — `GET /api/combos/:id/profissionais` já
      responde isso.

- [ ] **O site nunca foi aberto num celular de verdade.** Tudo que se sabe dele
      em tela pequena vem de emulação (Chrome headless a 390×844), e é de lá
      que vem quase todo o tráfego — em especial **pelo link da bio do
      Instagram, que abre num webview**, não no navegador. O webview tem barra
      própria que come altura, bloqueia coisas que o Safari permite e trata
      `target="_blank"` de outro jeito. O que já foi feito por precaução:
      `dvh` com `vh` de reserva na janela de agendamento, `env(safe-area-inset)`
      no rodapé, alvos de toque de 44px. O que falta é abrir no aparelho e
      percorrer o fluxo inteiro — incluindo o "tirar dúvida" e o botão
      flutuante, que saem do webview para o app do WhatsApp e podem não voltar.

- [ ] **O SEO depende de o buscador rodar JavaScript.** Título, descrição e o
      JSON-LD são escritos por `site/seo.js` depois que a vitrine responde. O
      Google renderiza JS e enxerga, mas numa segunda passada e sem garantia de
      prazo; o resto (Bing, preview de link do WhatsApp e do Instagram) lê só o
      HTML servido, e recebe o texto neutro do `index.html`. **O preview de
      link é o caso que dói primeiro**, porque é o que aparece quando a empresa
      manda o próprio site no WhatsApp. A saída é pré-renderizar o `<head>` por
      empresa no servidor que entrega o HTML — a vitrine já tem tudo de que
      isso precisa numa chamada.

- [ ] **`npm run reset` com o `npm run dev` rodando deixa o servidor com cache
      de empresa velho.** O id da Barbearia é sorteado a cada reset, e o
      processo em execução continua com a lista antiga por alguns segundos — o
      site abre como a empresa padrão ("Meu negócio", sem catálogo) e parece
      que o seed falhou. Passa sozinho, mas custa um susto; `esquecerCacheDeEmpresas()`
      existe e só é chamado nos testes.

- [ ] **Unidade com endereço diferente da config, quando é a única.** Com uma
      unidade só, o site mostra `config.endereco` (regra de `lugares()`), e a
      unidade pode ter outro endereço gravado — nada avisa. Caso raro (quem
      tem uma loja não cadastra unidade), mas o painel poderia esconder a tela
      de Unidades até a segunda, ou sincronizar os dois.

- [ ] **O fechamento automático pode mandar mensagem para quem não veio.** Se
      ninguém marcar a falta, o sistema conclui o atendimento e a cliente
      recebe "como foi seu atendimento?" no dia seguinte às 11h. Hoje o que
      segura isso é a atendente corrigir durante o dia, mais o fato de o
      atendimento fantasma ficar parado no caixa. Quando o webhook de resposta
      do WhatsApp existir, dá para fechar automaticamente só quem respondeu
      "SIM" — aí o `confirmado` passa a significar algo.

- [ ] **A Agenda ainda recorta em 8h–20h.** O Resumo passou a esticar a grade
      pelo que existe no dia (`faixaDeHoras`, em `shared/tempo.js`), mas
      `App.jsx` continua com `H_INI`/`H_FIM` fixos em dez lugares, e o
      atendimento às 7h some do mesmo jeito que sumia lá. Não foi feito junto
      porque ali as constantes também alimentam `ondeCaiu`, que traduz a
      posição do ponteiro em horário no arrastar-para-remarcar — mexer nelas
      sem cuidado desalinha o solto do agarrado.

- [ ] **Três vermelhos claros sem nome.** `#F8E7E7`, `#F7EFEF` e `#F3E6E6` são
      o fundo suave do mesmo estado de erro, em valores quase iguais e
      escritos à mão. `--erro` acabou de nascer para o tom forte; falta
      decidir se os três viram um `--erro-claro` só — o que muda pixel em três
      telas, e por isso não entrou junto.

- [ ] **Antes e depois não tem tela no painel.** `config.antesDepois` existe e o
      site já renderiza, mas só o `seed` consegue preencher — para qualquer
      empresa que não seja a Laura, a seção fica em "Em breve" para sempre.
      Falta em `ConfigSite.jsx` um editor de pares de imagem (dois `Imagem` e um
      título por caso, com remover e reordenar). É o que separa isto de ser
      funcionalidade de verdade em vez de vitrine de uma empresa só.

- [ ] **Imagem que falha no site não deixa rastro nenhum.** Nenhum `<img>` do
      bundle tem `onError`, então URL quebrada vira caixa vazia — no antes e
      depois é pior, porque os rótulos "Antes"/"Depois" dão lugar à foto e não
      sobra nem texto. Indistinguível de seção sem conteúdo, tanto para quem
      visita quanto para quem está depurando. Um `onError` que volte ao rótulo
      resolveria os dois casos.

- [ ] **Foto de antes e depois é o dado mais sensível que o produto publica** —
      rosto de cliente, num site aberto. Hoje nada no sistema registra que
      existe autorização de imagem: é combinado fora dele. Quando a tela do
      painel for feita, ela precisa pedir o aceite junto, com data e quem
      autorizou, senão a empresa publica achando que pode. Ver LGPD em
      `ARQUITETURA.md`.

### Cobertura de teste

- [ ] Catálogo, clientes, config e uploads não têm teste de rota. São as que
      sobraram; agenda, combos, cadastro, plataforma e isolamento têm.
- [ ] `despachar()` só é testado no modo manual, que é o de hoje. O caminho da
      Cloud API da Meta — sucesso, erro, marcação de enviado — não tem teste, e
      precisará de um provider falso quando a conta sair.
- [ ] Duas clientes disputando o mesmo horário: a transação existe e nada prova
      que ela segura.
- [ ] **O site não tem teste de fluxo nenhum.** Um passo do meio do
      agendamento ficou sendo pulado (um `setPasso` no lugar de `avancar()`) e
      ninguém notou até refazer o fluxo à mão em 2026-09-19 — a suíte só cobre
      o servidor. Um teste de navegador (Playwright) que atravesse serviço →
      horário → WhatsApp pegaria isso; a captura por CDP usada na revisão
      mostrou que dá para automatizar sem instalar nada além do Chrome.

### Produto

- [ ] **A Vital não consegue cobrar.** `plano` é texto livre, sem preço nem
      ciclo, e não há cobrança nenhuma. O produto funciona inteiro e não fatura.
- [ ] **Pagamento online da cliente não existe** (item antigo, no fim do
      `CLAUDE.md`): `pag_status` e `pag_ref` esperam um gateway que nunca veio.
- [ ] Acesso de suporte ao painel de uma empresa: a auditoria já existe, o
      caminho de entrada não — e é a única porta que atravessaria o isolamento
      de propósito, então merece desenho, não improviso.

### Código

- [ ] `web/src/painel/App.jsx` passou de 1300 linhas e junta agenda, clientes,
      serviços, equipe, CRM e financeiro. Cada tela nova que nasce ali aumenta o
      risco de mexer numa e quebrar outra. Combos, Unidades, Usuários e ConfigSite
      já saíram; falta separar o resto — e o obstáculo é que os ajudantes
      (`Modal`, `Campo`, formatadores) moram lá dentro.
- [ ] **`npm run seed -- --forcar` provavelmente quebra hoje.** Reinsere tudo
      com os mesmos ids fixos (`v1`, `s1`, o tenant `laurafaust`...) sem
      limpar antes — a segunda passada esbarra em PK duplicada. Não notado
      porque `npm run reset` (que limpa o schema antes) é o caminho de
      verdade; `--forcar` sozinho não tem teste nem uso conhecido.
- [ ] **`?template=` só pré-visualiza a pele, não a estrutura.** O parâmetro
      troca o `data-template` (tokens do CSS) mas `ehClinica` em `App.jsx` lê
      `marca.template` da config — então `?template=bandeja` numa empresa
      Clínica mostra o hero em arco e as seções da Clínica com as cores da
      Bandeja, e o inverso também. Achado ao capturar telas; pra valer como
      pré-visualização de verdade, o override precisa chegar no `dados.marca`
      que a `Home` lê, não só no `aplicarTema`.
- [ ] **A chave "Fotos dos serviços" do painel não faz nada.** `ConfigSite.jsx`
      grava `exibir.fotos`, a vitrine devolve, e nenhum componente do site lê —
      nem a grade de círculos nem os cartões da Clínica. A empresa desliga e
      as fotos continuam. Ou os dois passam a respeitar a chave, ou ela sai
      da tela; chave que não faz nada ensina a pessoa a não confiar nas
      outras. Notado ao montar os cartões (2026-09-18).
- [ ] **A palavra dourada do hero da Clínica (`--ouro-claro` sobre
      `--marca-escura`) não tem guarda de contraste por empresa.** Para a Laura
      dá 3,2:1 (texto grande, passa); uma empresa cuja cor escurecida cair
      numa luminância média pode ficar abaixo de 3:1. `comContraste()` em
      `tema.js` resolveria (um token `--ouro-sobre-escura`), mas o dourado é
      do CSS do modelo e o tema.js não sabe dele — mesma tensão do `FUNDOS`.
- [ ] **O fallback estático de `--marca` em `web/src/site/styles.css` (`#3F6350`,
      sálvia) não bate com o padrão de verdade de uma empresa nova**
      (`configPadrao.marca.corPrimaria`, `#A32A4E`, em `server/src/lib/tenant.js`).
      Cosmético — só pinta um quadro antes de `tema.js` rodar, ninguém fica
      olhando pra ele — mas achado ao revisar `DESIGN.md`: os dois deveriam
      ser o mesmo valor e não são. Alinhar quando alguém mexer nesse trecho.

### Operação

- [ ] **O funil só existe no back-office da Vital; a empresa não vê o dela.**
      É o dono que decide mexer no próprio site, e hoje o número que diria
      "você perde 70% na abertura do agendamento" está só do nosso lado.
      `funilDaEmpresa()` em `lib/funil.js` já devolve isso pronto, dentro do
      contexto da empresa — falta a rota no painel e um lugar na tela de
      Resumo. Foi deixado de fora de propósito: a primeira pergunta era
      nossa ("a tela de agendamento funciona?"), e a dela vem depois.
- [ ] Não há como exportar os dados de uma empresa, nem para ela levar embora
      nem para backup por empresa. Vira exigência de LGPD no dia do primeiro
      cliente de verdade.
- [ ] `npm run reset` recria o cenário inteiro de exemplo, mas empresas criadas
      pelo cadastro self-service somem. Aceitável em desenvolvimento; anotado
      para não surpreender.
- [ ] O cenário do `seed` precisa acompanhar cada funcionalidade nova. Unidades,
      combos, adicionais e formulários ficaram de fora por blocos inteiros, e
      uma máquina nova via um sistema mais pobre do que o que existe — seed que
      não mostra a funcionalidade faz a pessoa achar que ela não existe.

## Importante para produção

Lista viva. **Nada aqui bloqueia o desenvolvimento local**, mas cada item vira
problema real no dia em que houver cliente de verdade acessando. Ao terminar
qualquer bloco, pergunte se surgiu item novo para cá.

### Segredos e acesso

- [x] ~~`ADMIN_TOKEN` vazio deixava o painel sem senha.~~ Resolvido no Bloco 3b:
      login com argon2 e sessão em cookie.
- [ ] **Cookie de sessão só vai por HTTPS quando `NODE_ENV=production`.** Em
      produção essa variável PRECISA estar definida, senão o cookie viaja em
      claro. Conferir no provedor antes de publicar.
- [ ] **As senhas do banco de desenvolvimento estão em `server/.env`**
      (`neondb_owner` e `vital_app`, na Neon). Nesse branch, o banco é alcançável
      pela internet e guarda o cenário do seed — inclusive o nome, a cor e as
      fotos da primeira cliente. Em produção as senhas vêm do cofre de variáveis
      do provedor, nunca de arquivo, e de um branch **sem**
      `VITAL_BANCO_DESCARTAVEL`. Trocar as senhas antes do lançamento, e a do
      `neondb_owner` sempre que alguém deixar o projeto.
- [x] ~~O front embutia o token do painel no bundle.~~ Resolvido nos Blocos 3 e
      3b: a sessão é cookie `httpOnly`, que o JavaScript não lê, e o bundle do
      site nunca importa `painel-api.js`. Não há credencial de painel no código
      publicado — confirmado por varredura.
- [ ] `CORS_ORIGIN` precisa apontar para o domínio real, não `localhost`.
- [ ] Conferir que nenhum log imprime a `DATABASE_URL` inteira (o boot já
      mascara a senha — manter assim ao mexer nele).
- [x] ~~As rotas públicas de escrita não têm limite de chamadas.~~ Resolvido:
      `lib/limite.js` limita `/evento`, `/agendar` e `/identificar` por IP e
      empresa. Ver `ARQUITETURA.md`.
- [ ] **O limite de chamadas conta na memória do processo.** Com mais de uma
      instância, cada uma tem o próprio balde e o teto real vira N vezes o
      configurado. Segura script solto, não segura ataque distribuído. A
      proteção de verdade é na borda (Cloudflare, WAF do provedor); quando ela
      existir, `RATE_LIMIT=off` desliga a daqui sem mexer em código. Se um dia
      valer a pena centralizar sem borda, o balde vira uma chave com TTL no
      Postgres — mas isso é uma escrita a mais por requisição, e a borda é mais
      barata.

### Banco

- [ ] **Migrations rodam no boot da API.** Com uma instância só, tudo bem. Com
      várias subindo ao mesmo tempo (o normal em nuvem), todas tentam migrar
      juntas. Antes do primeiro deploy com mais de uma instância, pôr um
      *advisory lock* do Postgres em volta do runner, ou tirar a migration do
      boot e rodar como passo separado do deploy.
- [ ] **Conexões esgotam rápido em serverless, mas o pooler brigaria com o
      RLS do jeito que está hoje.** Cada função Vercel abre o próprio pool e os
      provedores têm limite baixo de conexões, então a saída natural seria a
      *connection string* com pooler (Neon e Supabase oferecem uma). Só que
      **elas usam pooling em modo transação**, e nossa empresa é marcada na
      conexão com `set_config(..., false)`, que é escopo de *sessão*: em modo
      transação, cada comando pode cair num backend diferente. Duas
      consequências, uma ruim e uma pior — a consulta perde o contexto e não
      devolve nada, e o backend que ficou marcado pode servir outra empresa
      depois, aí sim vazando.

      **Antes de usar pooler em modo transação**, trocar para escopo de
      transação: envolver a requisição num `BEGIN`/`COMMIT` e usar
      `set_config(..., true)` (equivalente a `SET LOCAL`), que morre junto com a
      transação e não sobrevive na conexão. Enquanto for conexão direta ou
      pooling em modo sessão, o desenho atual está correto — o `RESET` na
      devolução cobre.
- [ ] **Reduzir o tamanho do pool** por instância, seja qual for a escolha
      acima.
- [ ] **Conferir se o usuário do provedor não ignora o RLS.** É a armadilha
      que apaga o Bloco 2 inteiro em silêncio: o Postgres ignora Row-Level
      Security para superusuário e para o dono da tabela, e o usuário que Neon
      ou Supabase entregam por padrão costuma ser um dos dois. Se a aplicação
      conectar com ele, as políticas continuam lá, sem efeito nenhum, e nada
      falha para avisar. Em produção, repetir o que foi feito local: um papel
      só da aplicação, sem `SUPERUSER` e sem `BYPASSRLS`, com `GRANT` nas
      tabelas. **Testar com duas empresas antes de confiar.**
- [ ] **A senha de `vital_app` é `vitalapp` em desenvolvimento**, definida por
      `npm run senha-app` a partir do `.env`. Em produção o papel é criado e a
      senha definida pelo cofre do provedor — o script recusa rodar fora de
      localhost.
- [ ] **`DATABASE_ADMIN_URL` é credencial de deploy, não da aplicação.** Ela
      pode criar tabela e ignora RLS. O processo que atende requisição nunca
      deve ter acesso a ela.
- [ ] **TLS obrigatório no gerenciado.** `db.js` já liga sozinho quando a URL
      não é localhost; conferir se o provedor exige certificado verificado
      (hoje está `rejectUnauthorized: false`).
- [ ] **Backup.** O gerenciado faz sozinho; confirmar a frequência e, mais
      importante, **testar uma restauração** antes de ter dado real.
- [ ] `npm run reset` derruba o schema inteiro. Já recusa rodar fora de
      localhost — manter essa trava ao mexer no script.

### Hospedagem

- [ ] **O adaptador para storage de objeto (R2) já existe; falta ativá-lo para
      o deploy de verdade.** `server/uploads/<empresa>/` em disco só funciona
      com hospedagem que persiste — Vercel apaga o disco a cada deploy, e lá
      as imagens da empresa sumiriam no deploy seguinte. `routes/uploads.js`
      já sabe gravar direto num bucket R2 quando `R2_ACCOUNT_ID` e as outras
      três variáveis existem (ver ARQUITETURA.md, "Imagens"); sem elas, cai
      para disco, que é o caso de hoje em desenvolvimento. Falta: criar o
      token de escrita no bucket de produção, preencher as quatro variáveis
      no ambiente de deploy, e rodar `npm run uploads:subir` para levar o que
      já está em disco (as fotos da Laura Faust) para lá antes de publicar.
- [ ] **Fuso do servidor.** O código trata data e hora como texto justamente
      para não depender disso, mas os jobs de mensagem usam `TZ_EMPRESA`.
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

A suíte do motor de horários saiu daqui: existe, roda com `npm test` e está
descrita em `ARQUITETURA.md`. O que falta cobrir, em ordem de risco:

- [x] Rotas de agendamento por HTTP, com papéis: o que dono e funcionário podem
      ler, criar, alterar e apagar
- [ ] Duas clientes disputando o mesmo horário ao mesmo tempo (a transação já
      existe; falta o teste que prova que ela segura)
- [ ] Catálogo, clientes e configuração — as rotas que ainda não têm teste
- [ ] Isolamento entre empresas (é o item já listado no Bloco 9)
