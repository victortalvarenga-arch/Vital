# Acessos de desenvolvimento

Tudo aqui é ficção criada pelo `npm run seed`, na sua máquina. **Nenhuma destas
contas existe em produção**: o seed confere a `DATABASE_URL` antes de criar
qualquer uma, e não cria nada se ela não apontar para `localhost`.

`cd server && npm run reset` apaga e recria exatamente o que está nesta página.

**Senha de todas: `vital1234`**

---

## As três interfaces

| Endereço | O que é |
|---|---|
| <http://localhost:5173/vital.html> | Página da Vital — onde uma empresa se cadastra |
| <http://localhost:5173/vital.html#equipe> | Back-office da Vital — nossa equipe |
| <http://lume.localhost:5173> | Site do Estúdio Lume |
| <http://lume.localhost:5173/painel.html> | Painel do Estúdio Lume |
| <http://barbearia.localhost:5173> | Site da Barbearia do João |
| <http://barbearia.localhost:5173/painel.html> | Painel da Barbearia do João |

`localhost:5173` sem subdomínio abre o Estúdio Lume — é a empresa padrão.

**Por que `*.localhost` funciona sem configurar DNS:** o navegador resolve
qualquer subdomínio de `localhost` para 127.0.0.1 por conta própria, e o Vite
escuta ali. O `Host` da requisição segue inteiro até o Express, que é quem
descobre de qual empresa é — por isso o proxy do Vite usa `changeOrigin: false`.
Se algum dia os subdomínios pararem de resolver, é o primeiro lugar a olhar.

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

## Estúdio Lume — a empresa de exemplo

Estética, com catálogo, clientes e agenda populados. É o cenário para olhar
telas cheias.

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

O `seed` reproduz o mesmo cenário em qualquer máquina — não há dump para copiar
nem estado fora do Git.

| No Estúdio Lume | |
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

**O subdomínio dá "não existe uma agenda neste endereço"** — a empresa foi
apagada por um `reset` ou o slug mudou. Confira em
<http://localhost:5173/vital.html#equipe>, que lista os endereços de todas.

**O painel cai em "criar o primeiro acesso"** — aquela empresa está sem
usuários. A tela diz o nome da empresa no topo: se não for a que você queria,
está no endereço errado.

**`npm run reset` não recria as contas** — a `DATABASE_URL` do `server/.env` não
está apontando para `localhost`. É a guarda funcionando.
