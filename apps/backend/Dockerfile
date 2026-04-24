FROM oven/bun:1.3.5-alpine AS base

WORKDIR /app/apps/backend

COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile

COPY src ./src
COPY data/habit-tracker.db ./seed/habit-tracker.db
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3101
ENV DATABASE_URL=file:./data/habit-tracker.db
ENV FRONTEND_URL=http://localhost:3000

EXPOSE 3101

ENTRYPOINT ["/entrypoint.sh"]
