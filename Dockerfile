FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY src ./src
COPY public ./public

# Garante que os diretorios existam; no Fargate o EFS e montado em /app/data
RUN mkdir -p /app/data /app/logs

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/platform.js"]
