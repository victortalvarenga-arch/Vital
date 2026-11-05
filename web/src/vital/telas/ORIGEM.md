# Telas da página de venda

Capturas reais do produto, usadas em `../Inicio.jsx`. Não são desenho nem
montagem: o Chrome abre o site e o painel de verdade e fotografa.

O negócio que aparece é o **Studio Aurora**, uma empresa de estética
inventada que existe só no banco de desenvolvimento — nomes, telefones,
endereço e preços são ficção. Ele existe porque as duas empresas do seed não
servem para material público: a Laura Faust é uma pessoa real (CLAUDE.md), e a
Barbearia do João faria a Vital parecer um produto de barbearia. A legenda da
abertura da página diz que o negócio é de exemplo.

As fotos de pessoas que aparecem no site do Studio Aurora são as fotos de
exemplo dos modelos (`web/src/site/modelos/fotos/`, Unsplash, licença de uso
comercial livre — origem em `ORIGEM.md` de lá).

Cada modelo de site é fotografado com uma cor e uma foto próprias, todas tons
do painel (`MODELOS_DO_SITE` em `capturar.mjs`): Essencial em vinho, Galeria
em berinjela com a foto da máscara facial (enviada como capa durante a
captura), Serena em rosa. A captura troca a config do Studio Aurora para cada
foto e a devolve no fim, mesmo se der erro no meio. Cada rodada sobe a capa da
Galeria de novo, então a pasta de uploads do Studio Aurora acumula uma cópia
por rodada — some no `npm run reset`.

## Refazer

Com o `npm run dev` de pé:

```
node web/scripts/vitrine/montar-cenario.mjs   # cria ou atualiza o Studio Aurora
node web/scripts/vitrine/capturar.mjs         # grava as telas aqui, em WebP
```

O cenário refaz a agenda do dia a cada rodada, porque "na cadeira agora" e
"próxima" dependem da hora da foto: tire as fotos no meio da tarde. O Studio
Aurora some no `npm run reset`; o script o recria.

Refaça quando uma tela mudar de cara. Foto velha de tela que mudou é a página
de venda prometendo um produto que não existe mais.
