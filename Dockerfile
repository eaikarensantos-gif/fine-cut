# ── Stage 1: Build React client ──────────────────────────────
FROM node:20-slim AS client-build

WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ── Stage 2: Production image ────────────────────────────────
FROM node:20-slim

WORKDIR /app

# Dependências do servidor
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# Código do servidor
COPY server/ ./server/

# Client buildado do stage 1
COPY --from=client-build /app/client/dist ./client/dist

# Diretórios de dados
RUN mkdir -p /app/server/uploads /app/server/thumbnails

ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "server/index.js"]
