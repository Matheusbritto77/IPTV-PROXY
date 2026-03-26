FROM oven/bun:1.3.9 AS deps

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --verbose

FROM oven/bun:1.3.9

WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY . .

CMD ["bun", "run", "start"]
