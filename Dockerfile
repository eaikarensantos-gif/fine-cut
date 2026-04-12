FROM node:20-slim

WORKDIR /app

# Dependências do servidor
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# Código do servidor
COPY server/ ./server/

# Client pré-buildado (commitado no repo)
COPY client/dist ./client/dist

# Diretórios de dados
RUN mkdir -p /app/server/uploads /app/server/thumbnails

ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "server/index.js"]
