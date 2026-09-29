FROM node:20-alpine AS client-builder

WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

FROM node:20-alpine AS server-dependencies

WORKDIR /app/server
COPY server/package*.json ./
RUN npm install --omit=dev

FROM node:20-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

COPY --from=server-dependencies /app/server/node_modules ./server/node_modules
COPY server/package*.json server/server.js server/seed.js ./server/
COPY server/middleware ./server/middleware
COPY server/models ./server/models
COPY server/routes ./server/routes
COPY server/services ./server/services
COPY server/socket ./server/socket
COPY server/utils ./server/utils
COPY --from=client-builder /app/client/dist ./client/dist
RUN mkdir -p /app/uploads

WORKDIR /app/server
EXPOSE 5000
CMD ["node", "server.js"]