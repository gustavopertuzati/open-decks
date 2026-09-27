# Single container: Express API + static frontend on one PORT.
# Same deploy shape as dice-game: PORT injected by the host (orkestr),
# /health healthcheck, ephemeral data (fine here — DB resets weekly by design).
FROM node:20-slim
ENV NODE_ENV=production \
    PORT=3000 \
    TZ=Europe/Zurich
# tzdata -> node-cron "lundi 06:00 Europe/Zurich" works inside the container
RUN apt-get update && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server.js db.js lottery.js tunnel.js ./
COPY public/ ./public/
RUN mkdir -p data uploads && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
