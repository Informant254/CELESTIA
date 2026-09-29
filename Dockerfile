FROM node:20-slim

# For better-sqlite3, sharp, canvas etc needs build tools
RUN apt-get update && apt-get install -y \
    python3 make g++ ffmpeg \
    libsqlite3-dev \
    libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund \
    --fetch-retries=5 \
    --fetch-retry-mintimeout=20000 \
    --fetch-retry-maxtimeout=120000 \
    && npm cache clean --force

COPY . .
# EXPOSE 3000 — Railway injects PORT env automatically; she reads it
ENV NODE_ENV=production
# Bot on $PORT; pairing station (optional second service) on PAIRING_PORT
CMD ["node", "--max-old-space-size=512", "index.js"]
