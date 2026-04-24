import { cors } from "@elysiajs/cors"
import { jwt } from "@elysiajs/jwt"
import { swagger } from "@elysiajs/swagger"
import { Elysia } from "elysia"
import { loadConfig, type AppConfig } from "./config.ts"
import { createDatabase, type AppDatabase } from "./db/client.ts"
import { initializeDatabase } from "./db/init.ts"
import { createAuthRoutes } from "./modules/auth/routes.ts"
import { createHabitRoutes } from "./modules/habits/routes.ts"

export type AppInstance = Awaited<ReturnType<typeof createApp>>

export async function createApp(configOverrides: Partial<AppConfig> = {}) {
  const config = {
    ...loadConfig(),
    ...configOverrides,
  }

  const { client, db } = createDatabase(config.databaseUrl)
  await initializeDatabase(client)

  const app = new Elysia()
    .use(
      cors({
        origin: (request) => {
          const origin = request.headers.get("origin")
          if (!origin) {
            return true
          }

          if (
            config.env !== "production" &&
            (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"))
          ) {
            return true
          }

          return origin === config.frontendUrl
        },
        credentials: true,
      }),
    )
    .use(
      jwt({
        name: "accessJwt",
        secret: config.jwtSecret,
        exp: config.accessTokenTtl,
      }),
    )
    .use(
      jwt({
        name: "refreshJwt",
        secret: config.jwtSecret,
        exp: config.refreshTokenTtl,
      }),
    )
    .use(
      swagger({
        path: "/swagger",
        documentation: {
          info: {
            title: "Cycle API",
            version: "1.0.0",
            description: "Backend API for Cycle, the recurring life tracker for rituals and upkeep.",
          },
          tags: [
            { name: "Authentication", description: "OTP sign-in and token management." },
            { name: "Habits", description: "Habit CRUD and period queries." },
            { name: "Habit Logs", description: "Completion log management." },
            { name: "Metadata", description: "Frequency and category lookup." },
            { name: "Data", description: "Import and export endpoints." },
          ],
        },
      }),
    )
    .get("/", () =>
      ok({
        name: "Cycle API",
        docs: "/swagger",
      }),
    )
    .get("/health", () =>
      ok({
        status: "healthy",
        timestamp: new Date().toISOString(),
      }),
    )
    .use(createAuthRoutes({ db, config }))
    .use(createHabitRoutes({ db }))

  return {
    app,
    db,
    client,
    config,
  }
}

function ok<T>(data: T) {
  return {
    success: true as const,
    data,
  }
}

export type BackendDatabase = AppDatabase
