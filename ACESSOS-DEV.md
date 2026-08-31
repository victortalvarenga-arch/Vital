# Acessos de desenvolvimento

Tudo aqui é criado pelo `npm run seed`, na sua máquina. **Nenhuma destas
contas existe em produção**: o seed confere a `DATABASE_URL` antes de criar
qualquer uma, e não cria nada se ela não apontar para `localhost`.

**Uma exceção ao "tudo é ficção":** a empresa "Laura Faust" usa o nome, a cor
e as fotos reais da primeira cliente confirmada da Vital — ela ainda não usa
o produto, é bancada de ensaio para o modelo Clínica antes do lançamento (ver
PRODUCT.md, "Evidence on Hand"). Nasce pelo mesmo caminho de uma empresa de
verdade (`provisionarEmpresa`, como a Barbearia), só com id fixo
(`laurafaust`) em vez de sorteado — as fotos já resolvidas em disco/bucket
precisam de uma pasta estável entre um `npm run reset` e outro. As contas de
login (`dono@vital.com` etc.) continuam sendo credenciais de desenvolvimento,
não dela.

`cd server && npm run reset` apaga e recria exatamente o que está nesta página.

**Senha de todas: `vital1234`**

---

## As três interfaces

| Endereço | O que é |
|---|---|
| <http://localhost:5173/vital.html> | Página da Vital — onde uma empresa se cadastra |
| <http://localhost:5173/vital.html#equipe> | Back-office da Vital — nossa equipe |
| <http://laurafaust.localhost:5173> | Site da Laura Faust |
| <http://laurafaust.localhost:5173/painel.html> | Painel da Laura Faust |
| <http://barbearia.localhost:5173> | Site da Barbearia do João |
| <http://barbearia.localhost:5173/painel.html> | Painel da Barbearia do João |

`localhost:5173` sem subdomínio abre a empresa padrão — vazia, sem catálogo
nem marca, o mesmo estado de uma recém-cadastrada. Laura Faust tem endereço
próprio, como qualquer empresa: só abre em `laurafaust.localhost:5173`.

**Por que `*.localhost` funciona sem configurar DNS:** o navegador resolve
qualquer subdomínio de `localhost` para 127.0.0.1 por conta própria, e o Vite
escuta ali. O `Host` da requisição segue inteiro até o Express, que é quem
descobre de qual empresa é — por isso o proxy do Vite usa `changeOrigin: false`.
Se algum dia os subdomínios pararem de resolver, é o primeiro lugar a olhar.

A API atende em <http://localhost:3333> e o front em `:5173`. No navegador você
só usa o `:5173` — o Vite repassa o que for `/api` e `/uploads` para a API.

---

## Os quatro modelos de site

`marca.template` decide a cara do site. A cor continua sendo escolha da
empresa em qualquer um deles; o que muda é forma, tipografia, sombra e o fundo
neutro em volta dessa cor.

| Modelo | Como é | Quem usa no seed |
|---|---|---|
| `bandeja` | Sombra suave, foto em círculo. O padrão | — |
| `quadro` | Fundo escuro, números em fonte mono, cantos retos | Barbearia do João |
| `caderneta` | Papel kraft, linhas de caderno | — |
| `clinica` | Duas colunas, neutro e espaçoso | Laura Faust |

Para ver qualquer modelo em qualquer empresa **sem salvar nada**, ponha
`?template=` na URL do site:

| Link | |
|---|---|
| <http://laurafaust.localhost:5173/?template=bandeja> | Bandeja |
| <http://laurafaust.localhost:5173/?template=quadro> | Quadro de Horários |
| <http://laurafaust.localhost:5173/?template=caderneta> | Caderneta |
| <http://laurafaust.localhost:5173/?template=clinica> | Clínica (o salvo) |

É só pré-visualização: não grava na config, e some ao tirar o parâmetro. Para
trocar de verdade, painel → **Configurações → Site da cliente → Modelo**.

---

## Onde as fotos moram

As fotos do cenário **não estão no Git** — `server/uploads/` é pasta de
arquivo enviado por empresa, e estas são de uma cliente real. Ficam num bucket
público do Cloudflare R2, e o seed grava a URL de lá:

| | |
|---|---|
| Bucket | `vital-dev`, na conta Cloudflare do Victor |
| Endereço público | `https://pub-474ec1f20c2c443cba21f1bcf59fd2fd.r2.dev` |
| Variável | `UPLOADS_BASE_URL`, no `server/.env` |
| Caminho | `<empresa>/<arquivo>` — as da Laura em `laurafaust/` |

Conferir se estão de pé:
<https://pub-474ec1f20c2c443cba21f1bcf59fd2fd.r2.dev/laurafaust/logo.jpg>

**Sem a variável, o seed volta para `/uploads/<empresa>/` em disco** — que só
funciona se você tiver os arquivos ali. É o que faz uma máquina nova nascer com
o site sem imagem nenhuma.

Isso é só leitura. Para o **upload pelo painel** também ir para o bucket,
faltam as quatro `R2_*` no `.env` (ver `.env.example`); sem elas a rota grava
em disco local e avisa no console. Detalhe do adaptador em `ARQUITETURA.md`.

---

## Equipe da Vital (nós)

Administra a plataforma. **Não abre o painel de nenhuma empresa** — é outra
tabela, outro cookie, outra identidade.

| E-mail | Papel | Pode |
|---|---|---|
| `victor@vital.com` | admin | ver as empresas, suspender, reativar, mudar plano |

Um segundo papel existe, `suporte`, que só enxerga. Ainda não há tela para
convidar gente — crie pelo banco se precisar testar.

---

## Laura Faust — a empresa de exemplo

Estética, com catálogo, clientes e agenda populados. É o cenário para olhar
telas cheias — e a bancada de ensaio da primeira cliente real da Vital
(nome, cor e fotos dela, catálogo e preços ainda nossos).

| E-mail | Papel | Vê |
|---|---|---|
| `dono@vital.com` | dono | o negócio inteiro |
| `funcionaria@vital.com` | funcionário | só a agenda e a produção da Karen Souza |

Entre as duas está a diferença de papel: a funcionária não vê o financeiro da
empresa, não vê a agenda das colegas e não consegue alterá-la nem sabendo o id.

---

## Barbearia do João — a segunda empresa

Existe para o isolamento ser visível. Outro ramo, outra cor, outro vocabulário
("barbeiros", não "profissionais"), e nasce pelo mesmo caminho de uma empresa de
verdade — `provisionarEmpresa`.

| E-mail | Papel |
|---|---|
| `joao@barbearia.com` | dono |

Abra as duas lado a lado: nenhuma enxerga a agenda, os clientes ou o catálogo da
outra, e é o banco que recusa, não o código da rota.

---

## O que já vem populado

O `seed` reproduz o mesmo cenário em qualquer máquina. A única coisa que não
vem do Git são as fotos — ver "Onde as fotos moram", abaixo.

| Na Laura Faust | |
|---|---|
| Unidades | Centro e Zona Sul. Bia atende no Centro, Karen na Zona Sul, Laura nos dois |
| Combo | "Dia de cuidado" — limpeza + design por R$ 199, em vez de R$ 225 |
| Adicionais | Design de sobrancelha e depilação de buço na limpeza; plástica dos pés em toda a categoria Unhas |
| Só como adicional | Depilação de buço — não aparece sozinha na vitrine |
| Formulário | Anamnese facial, 4 perguntas, pedida na limpeza e no peeling |

Para ver cada um funcionando: escolha "Limpeza de pele profunda" no site — ela
puxa a unidade, os adicionais e a ficha no mesmo agendamento.

## Cadastrar uma empresa nova

Em <http://localhost:5173/vital.html>. Ela nasce **vazia** — sem serviço nem
equipe, porque catálogo inventado por nós é catálogo que a empresa apaga depois.
O assistente de primeira configuração continua a conversa dentro do painel dela.

O endereço sai do nome: "Studio da Ana" vira `studio-da-ana.localhost:5173`.

Empresas criadas assim **somem no próximo `npm run reset`**. Só as duas acima
são recriadas.

---

## Se algo não abrir

**A página abre em branco e nada carrega** — quase sempre a API caiu e só o
Vite está de pé. Olhe o terminal do `npm run dev`: se disser
`Cannot find package ...` seguido de `Failed running 'src/index.js'`, o pull
trouxe dependência nova. **Depois de todo `git pull`, rode `npm install`.** O
front sobe sem ela e serve o HTML, então a tela aparece vazia sem erro nenhum
no navegador — o motivo fica só no log do servidor.

**O site aparece sem foto nenhuma** — falta `UPLOADS_BASE_URL` no
`server/.env`, ou ela mudou depois do último `npm run reset`. As URLs ficam
gravadas no banco na hora do seed: mexeu na variável, rode o reset de novo.

**O subdomínio dá "não existe uma agenda neste endereço"** — a empresa foi
apagada por um `reset` ou o slug mudou. Confira em
<http://localhost:5173/vital.html#equipe>, que lista os endereços de todas.

**O painel cai em "criar o primeiro acesso"** — aquela empresa está sem
usuários. A tela diz o nome da empresa no topo: se não for a que você queria,
está no endereço errado.

**`npm run reset` não recria as contas** — a `DATABASE_URL` do `server/.env` não
está apontando para `localhost`. É a guarda funcionando.
