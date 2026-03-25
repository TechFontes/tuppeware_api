# ---- Stage 1: Build ----
FROM node:22-alpine AS build

WORKDIR /app

# Copia arquivos de dependencias
COPY package.json package-lock.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Instala todas as dependencias (incluindo devDependencies para build)
RUN npm ci

# Copia o restante do codigo
COPY tsconfig.json ./
COPY src ./src/

# Gera o Prisma Client e compila TypeScript
RUN npx prisma generate && npm run build

# ---- Stage 2: Production ----
FROM node:22-alpine AS production

WORKDIR /app

# Copia arquivos de dependencias
COPY package.json package-lock.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Instala apenas dependencias de producao
RUN npm ci --omit=dev

# Copia o Prisma Client gerado e o build do stage anterior
COPY --from=build /app/generated ./generated/
COPY --from=build /app/dist ./dist/

# Porta interna da aplicacao
ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/src/server.js"]
