FROM node:22-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm run build:ui

COPY drizzle.config.ts ./

EXPOSE 3000

CMD ["sh", "scripts/start.sh"]
