FROM node:20-alpine
RUN apk add --no-cache openssl netcat-openbsd bash
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile
COPY entrypoint.sh ./
COPY . .
# Updated 2026-04-01: Fixed Instagram Business Account ID for conversations
RUN pnpm prisma:generate
RUN pnpm build

EXPOSE 3004
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "dist/main"]

