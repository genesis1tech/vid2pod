FROM node:22-alpine

RUN apk add --no-cache ffmpeg python3 py3-pip
RUN pip3 install --break-system-packages yt-dlp

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm run build:ui

COPY drizzle.config.ts ./

EXPOSE 3000

CMD ["sh", "scripts/start.sh"]
