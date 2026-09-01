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
# Exclude cloned repos from image context if needed, but we have them
EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000
CMD ["node", "index.js"]
