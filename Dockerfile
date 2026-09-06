FROM node:20-slim

# For better-sqlite3, sharp, canvas etc needs build tools
RUN apt-get update && apt-get install -y \
    python3 make g++ \
    libsqlite3-dev \
    libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production --ignore-scripts || npm install --production

COPY . .
# EXPOSE 3000 — Railway injects PORT env automatically; she reads it
ENV NODE_ENV=production
# Bot on $PORT; pairing station (optional second service) on PAIRING_PORT
CMD ["node", "index.js"]
