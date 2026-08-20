FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787 \
    RECOIL_HOST=0.0.0.0 \
    RECOIL_SERVE_STATIC=1 \
    RECOIL_CACHE_DIR=/app/.recoil-cache \
    RECOIL_WORKSPACE_FILE=/app/.recoil-data/workspace.json

COPY package.json ./
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src/core ./src/core

RUN mkdir -p /app/.recoil-cache /app/.recoil-data

EXPOSE 8787
VOLUME ["/app/.recoil-data", "/app/.recoil-cache"]
HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
