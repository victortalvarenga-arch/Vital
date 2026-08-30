# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Três públicos, três interfaces, nenhuma se mistura com a outra:

- **A cliente que agenda** (site, `web/src/site/`) — não tem conta, não faz
  login. Informa o WhatsApp na hora de marcar e é reconhecida pelo número nas
  vezes seguintes. Quase sempre está no celular, muitas vezes decidindo em
  poucos minutos entre uma tarefa e outra.
- **Quem opera o negócio** (painel, `web/src/painel/`) — dono ou funcionário
  de uma empresa-cliente da Vital (salão, barbearia, clínica, oficina, petshop
  — qualquer negócio que marca horário). Dono vê e configura tudo, inclusive
  financeiro; funcionário vê a própria agenda e a própria produção. Abre o
  painel tanto do balcão quanto do próprio telefone.
- **A equipe da Vital** (`vital.html`) — administra a plataforma: vê a lista
  de empresas-cliente, números agregados, suspende/reativa. Não pertence a
  nenhuma empresa-cliente e nunca vê o dado de negócio de nenhuma, só
  contagens.

Um quarto público existe só na página de cadastro (`vital.html`, fora do
`#equipe`): o **dono de negócio decidindo se assina a Vital** — ainda não é
usuário do produto, é o alvo da página de venda.

## Product Purpose

Agenda e CRM por WhatsApp para negócios que atendem por horário marcado —
salão, barbearia, clínica de estética, petshop, oficina. Multiempresa: uma
empresa se cadastra sozinha, configura o próprio site de agendamento e o
próprio painel, e começa a atender sem falar com a Vital. Sucesso é a empresa
operando (agenda cheia, lembrete saindo, financeiro fechando) sem precisar de
suporte para configurar nada.

## Positioning

Dois pilares, com peso igual — nenhum deles sozinho é o argumento:

1. **Autonomia de ponta a ponta.** Cadastro, configuração de site (marca,
   cor, logo, textos, catálogo) e primeiro atendimento acontecem sem contato
   humano do lado da Vital. Não é onboarding assistido com um passo
   self-service; é self-service com um assistente de primeira configuração
   dentro do próprio painel.
2. **WhatsApp como canal, não integração.** Lembrete, confirmação e CRM
   correm pelo WhatsApp porque é onde a cliente brasileira já está — não é
   preciso baixar um app novo para receber um lembrete ou responder "sim".

O mesmo banco atende todas as empresas, isolado por Row-Level Security do
Postgres — isso é mecanismo interno, não argumento de venda, mas é o que
sustenta o primeiro pilar: cadastrar empresa nova é uma linha, não um
deploy.

## Operating Context

- **Isolamento por RLS, não por deploy.** Todas as empresas dividem um banco
  só; o que separa uma da outra é política de segurança do próprio Postgres.
- **Cada empresa tem endereço próprio** (subdomínio ou domínio próprio); em
  `localhost` sempre resolve para a empresa padrão de desenvolvimento.
- **Sem app nativo ainda.** Site e painel são web responsivo, mobile
  primeiro; empacotamento com Capacitor é destino futuro (Bloco 11), ainda
  não construído — o design de hoje já evita qualquer interação que dependa
  só de mouse (hover como única pista, botão direito) para não precisar
  refazer telas quando o empacotamento chegar.
- **Vocabulário é configurável por empresa**, nunca fixo no código:
  "profissional" vira o que o negócio chamar. Nenhuma categoria, ramo ou
  texto de exemplo (o estúdio de estética do `seed`) faz parte do produto —
  é cenário de desenvolvimento.
- **O ramo de cada empresa-cliente é desconhecido de antemão.** O produto
  não pode assumir visual, texto ou fluxo de nenhum ramo específico
  (estética, barbearia, etc.) como se fosse o padrão.

## Capabilities and Constraints

- Cadastro self-service de empresa (`POST /api/cadastro`), assistente de
  primeira configuração, catálogo com serviços/adicionais/combos, agenda com
  arrastar-para-remarcar, financeiro com comissão e rateio, formulários de
  intake (anamnese/ficha), registro de auditoria por empresa, back-office da
  Vital com números agregados sem vazar dado de negócio.
- **Cobrança ainda não existe.** `plano` é texto livre, sem preço nem ciclo;
  não há gateway de pagamento. É a lacuna entre "produto pronto" e "empresa
  faturando" — ver `ROADMAP.md`.
- **Pagamento online da cliente não existe.** `pag_status`/`pag_ref`
  esperam um gateway que nunca veio (Pix/cartão via Asaas ou Mercado Pago).
- **Login da cliente com Google ainda não existe** (Bloco 5 do roadmap);
  hoje a identidade da cliente é só o WhatsApp.
- Datas e horas são texto, não `Date` — o negócio opera num fuso só.
- Telefone guardado só com dígitos, sem `+55`.

## Brand Commitments

Duas marcas distintas coexistem no mesmo produto, e nunca se misturam:

- **A marca de cada empresa-cliente** vem do banco, aplicada em runtime nos
  bundles de site e painel — cor, logo, capa e nome são dela, configuráveis
  por ela mesma. Nenhuma paleta ou identidade é fixa no CSS para esse lado.
- **A marca da Vital** é fixa e já está em código (`web/src/vital/styles.css`,
  ainda sem DESIGN.md que a documente formalmente): roxo `#4B2E83` como cor
  de marca, tipografia Inter, `IBM Plex Mono` para trechos de registro/log.
  Aparece só em `vital.html` (cadastro de empresa e back-office da Vital) —
  nunca no site ou painel de uma empresa-cliente.

## Evidence on Hand

**Pré-lançamento, mas com a primeira cliente real já definida.** Ela ainda
não usa o produto — só vai começar quando o projeto estiver pronto — mas é
uma pessoa real, de estética, não mais uma hipótese. Sendo a primeira, o
site dela é o que decide se a "fórmula" (modelo Clínica, personalização,
onboarding) está certa antes de vender para outras estéticas.

**O nome dela é Laura Faust — estética e beleza, Joinville/SC — e o `seed`
agora usa a identidade real dela como bancada de ensaio.** Antes o exemplo se
chamava "Estúdio Lume", inteiramente inventado; deixou de existir com esse
nome. `seed.js` grava o nome, a cor da marca (`#98a68c`), o logo, a capa e
fotos de serviço reais dela — tudo em `server/uploads/default/`, veio de um
material de identidade que ela mesma forneceu. **O catálogo de serviços
(nomes e preços) continua aproximação nossa**, não confirmado por ela; as
fotos são reais, os valores não. Isso **continua sendo dado de
desenvolvimento**, nunca o cadastro dela de verdade: quando ela começar a
usar o produto de fato, nasce por `POST /api/cadastro`/`provisionar.js`,
separado deste tenant de exemplo, do jeito que qualquer empresa nasce — o
seed não vira o cadastro dela sozinho, é só o ensaio que vem antes.

**Ainda nenhum depoimento, logo de cliente ou número de uso deve ser
fabricado** em nenhuma superfície — a primeira cliente real ainda não
publicou nada, e a página de cadastro (`vital.html`) continua podendo falar
só do que o produto faz, nunca de quem já usa.

## Product Principles

1. **Autonomia é o produto, não um recurso dele.** Toda decisão de fluxo
   pergunta se a empresa consegue chegar lá sozinha, sem suporte.
2. **Isso funciona para uma Vital com 200 clientes, ou só para um negócio
   só?** Qualquer tela, cor ou texto que assuma um ramo, uma empresa ou uma
   escala pequena está errado por construção.
3. **WhatsApp é canal de confiança, não recurso de CRM.** O que sai por lá
   (lembrete, confirmação, campanha) respeita opt-in e soa como a própria
   empresa falando, nunca como sistema.
4. **Mobile primeiro em todo lugar**, porque quase todo agendamento e boa
   parte da operação do painel saem do celular — e porque o destino nativo
   (Capacitor) não pode custar retrabalho de tela.
5. **Nada de prova que não existe.** Sem cliente pagante confirmado, nenhuma
   superfície simula tração, depoimento ou volume de uso.

## Accessibility & Inclusion

Nenhum padrão formal exigido hoje (nem WCAG, nem leitor de tela como
requisito confirmado). Boas práticas gerais — contraste, alvo de toque
confortável, navegação por teclado — seguem valendo como piso de qualidade,
sem virar checklist de conformidade até que o produto assuma esse
compromisso explicitamente.
