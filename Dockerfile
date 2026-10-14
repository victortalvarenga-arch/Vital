# Imagem de produção: um processo Node que serve API, telas e jobs.
# Por que um serviço só: ARQUITETURA.md, "Hospedagem".

# ── build: dependências e o bundle do front ──
FROM node:22-bookworm-slim AS build
WORKDIR /app
# Os package.json antes do código: mexer só no código não reinstala tudo.
COPY server/package.json server/package-lock.json server/
COPY web/package.json web/package-lock.json web/
RUN npm --prefix server ci --omit=dev && npm --prefix web ci
COPY server server
COPY web web
RUN npm --prefix web run build

# ── execução: só o que roda ──
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/server server
COPY --from=build /app/web/dist web/dist
# Em produção as imagens vão para o R2; a pasta existe só para o caminho de
# reserva não derrubar o upload por falta de permissão.
RUN mkdir -p server/uploads && chown node:node server/uploads
USER node
EXPOSE 3333
CMD ["node", "server/src/index.js"]
