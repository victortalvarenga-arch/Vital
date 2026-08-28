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
- [x] **Calendário por mês**, com navegação entre meses. Dia com vaga ganha um
      traço embaixo do número — não só cor, que não serve a quem não a
      distingue e some na impressão
- [x] Rota nova `/publico/dias-livres?mes=`, resolvendo o mês numa consulta só;
      dia a dia seriam trinta idas ao banco para pintar uma tela
- [x] Opção "qualquer profissional" no passo de escolha
- [x] Seção de serviços em grade de círculos, com a foto na frente do nome;
      inicial sobre a cor da marca quando não há foto
- [x] Recado opcional da cliente no agendamento, que chega ao painel
- [x] Animações discretas ao rolar, que somem inteiras com
      `prefers-reduced-motion`
- [x] **Instagram: só o link** (decidido em 2026-08-27 — ver abaixo)

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
- [ ] Encaixe manual pelo painel ainda não oferece adicionais — quem marca pelo
      balcão precisa lançar o valor na mão. Entra junto do redesenho dos
      formulários, no Bloco 7
- [ ] O ranking por serviço no financeiro credita o extra ao serviço principal
      (ver Bloco 6d, mesmo problema)
- [ ] **Falta "vender só como adicional".** Hoje um extra é um serviço normal,
      então ele também aparece sozinho na vitrine: cadastrar "depilação de
      buço" para oferecer junto da limpeza de pele coloca ela na lista da
      categoria também. Desligar "visível no site" não resolve — `ativo = 0`
      já significa "arquivado", e o motor recusa arquivado como extra.

      Precisa de coluna própria (algo como `services.somente_adicional`), para
      não misturar dois sentidos no mesmo campo. Migration pequena; o efeito é
      esconder da vitrine e continuar aceitando como extra.

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
- [ ] Encaixe de combo pelo painel (a rota `POST /agendamentos/combo` existe;
      falta o formulário)
- [ ] Foto própria do combo — o campo existe no banco e no site, falta o upload
      na tela de cadastro

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
- [ ] **Arrastar para remarcar** na agenda — hoje só pelo formulário de edição
- [x] Bloqueio de horário na agenda (almoço, folga, feriado), integrado ao
      `availability.js`, ao calendário do site e à gravação. Funcionário fecha
      só a própria agenda; feriado da empresa é do dono. Ver `ARQUITETURA.md`.
- [ ] Cadastro de unidades; profissional e serviço vinculados a unidade. A
      tabela `units` existe desde o Bloco 0 e **nenhuma rota a usa** — é o mesmo
      tipo de buraco que os bloqueios tinham antes deste bloco
- [ ] Cadastros redesenhados: serviços, equipe com jornada, clientes
- [x] Financeiro: recebido, a receber, previsto do dia, ticket médio, faltas,
      ranking por serviço, comissões e formas de pagamento
- [ ] Financeiro por período livre — hoje é sempre o mês inteiro — e comparação
      com o mês anterior
- [ ] Formulários: intake customizável por serviço (ex. anamnese de estética)
- [ ] Integrações: chaves de API / webhooks para ferramentas externas da empresa
- [ ] Logs: auditoria de quem fez o quê no painel

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

### Corretude

- [ ] **O ranking por serviço credita o adicional ao serviço principal.** O
      caixa total está certo; o "o que mais dá dinheiro" não. Combos já saem
      certos, porque o rateio vira o `valor` de cada linha na venda — os
      adicionais é que continuam pendurados num agendamento só. Decidir se o
      extra vira linha própria no relatório.
- [ ] **Encaixe pelo painel não oferece adicionais nem combos.** Quem marca pelo
      balcão lança o valor na mão, e o que ela digitar não bate com o que o site
      cobraria pelo mesmo atendimento.

### Cobertura de teste

- [ ] Catálogo, clientes, config e uploads não têm teste de rota. São as que
      sobraram; agenda, combos, cadastro, plataforma e isolamento têm.
- [ ] A fila de WhatsApp (`jobs/mensagens.js`) não tem teste nenhum, e é código
      que roda sozinho, sem ninguém olhando.
- [ ] Duas clientes disputando o mesmo horário: a transação existe e nada prova
      que ela segura.

### Produto

- [ ] **A Vital não consegue cobrar.** `plano` é texto livre, sem preço nem
      ciclo, e não há cobrança nenhuma. O produto funciona inteiro e não fatura.
- [ ] **Pagamento online da cliente não existe** (item antigo, no fim do
      `CLAUDE.md`): `pag_status` e `pag_ref` esperam um gateway que nunca veio.
- [ ] Acesso de suporte ao painel de uma empresa: a auditoria já existe, o
      caminho de entrada não — e é a única porta que atravessaria o isolamento
      de propósito, então merece desenho, não improviso.

### Operação

- [ ] Não há como exportar os dados de uma empresa, nem para ela levar embora
      nem para backup por empresa. Vira exigência de LGPD no dia do primeiro
      cliente de verdade.
- [ ] `npm run reset` recria as duas empresas de exemplo, mas empresas criadas
      pelo cadastro somem. Aceitável em desenvolvimento; anotado para não
      surpreender.

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
- [ ] **A senha do Postgres local é `vitaldev`**, escrita em `server/.env`.
      É senha de desenvolvimento; em produção vem do cofre de variáveis do
      provedor, nunca de arquivo.
- [x] ~~O front embutia o token do painel no bundle.~~ Resolvido nos Blocos 3 e
      3b: a sessão é cookie `httpOnly`, que o JavaScript não lê, e o bundle do
      site nunca importa `painel-api.js`. Não há credencial de painel no código
      publicado — confirmado por varredura.
- [ ] `CORS_ORIGIN` precisa apontar para o domínio real, não `localhost`.
- [ ] Conferir que nenhum log imprime a `DATABASE_URL` inteira (o boot já
      mascara a senha — manter assim ao mexer nele).

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

- [ ] **`server/uploads/<empresa>/` só funciona com disco que persiste.** Já
      está implementado e funcionando local (Bloco 6). Vercel apaga o disco a
      cada deploy — lá, as imagens da empresa sumiriam no deploy seguinte. Antes
      de publicar, ou escolher hospedagem com disco, ou trocar por storage de
      objeto (S3, R2, ou o do próprio provedor de banco). É um adaptador: só
      `routes/uploads.js` muda.
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
