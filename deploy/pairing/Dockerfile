FROM node:22-slim
WORKDIR /app
COPY deploy/pairing/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY pairing-site.js ./
COPY public/ ./public/
ENV NODE_ENV=production PORT=3001
EXPOSE 3001
CMD ["node", "--max-old-space-size=192", "pairing-site.js"]
