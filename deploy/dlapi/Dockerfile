FROM node:20-slim

ADD https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux /usr/local/bin/yt-dlp
RUN chmod +x /usr/local/bin/yt-dlp && /usr/local/bin/yt-dlp --version

WORKDIR /app
COPY server.js /app/server.js

ENV PORT=8080
EXPOSE 8080
USER node

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "/app/server.js"]
