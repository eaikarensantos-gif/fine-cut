# ── Stage 1: Build React client ──────────────────────────────
FROM node:20-slim AS client-build

WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ── Stage 2: Production image ────────────────────────────────
FROM node:20-slim

# Python 3 + pip para openai-whisper
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Instalar whisper em venv (evita PEP 668 em Debian 12+)
RUN python3 -m venv /opt/whisper-venv \
    && /opt/whisper-venv/bin/pip install --no-cache-dir openai-whisper

ENV PATH="/opt/whisper-venv/bin:$PATH"

# Pre-download do modelo tiny (~72MB) para não travar na 1a transcrição
RUN python3 -c "import whisper; whisper.load_model('tiny')"

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

ENV WHISPER_PATH="/opt/whisper-venv/bin/whisper"
ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "server/index.js"]
