import { cors } from "@elysiajs/cors"
import { swagger } from "@elysiajs/swagger"
import { Elysia } from "elysia"
import { type AppConfig } from "./config.ts"
import type { AppDatabase } from "./db/client.ts"
import { createSessionTokens } from "./modules/auth/sessions.ts"
import { createEnrollmentRoutes } from "./modules/auth/enrollment-routes.ts"
import { createAuthRoutes } from "./modules/auth/routes.ts"
import { createPasskeyRoutes } from "./modules/auth/passkeys-routes.ts"
import { createOfflineRoutes } from "./modules/habits/offline-routes.ts"
import { createHabitRoutes } from "./modules/habits/routes.ts"
import { createPackageRoutes } from "./modules/packages/routes.ts"
import type { PackageRegistry } from "./modules/packages/types.ts"

export type AppInstance = ReturnType<typeof createRuntime>

export function createRuntime(db: AppDatabase, config: AppConfig, options: {
  packageRegistry?: PackageRegistry
  sendOtp?: (config: AppConfig, email: string, code: string) => Promise<void>
} = {}) {
  const frontendOrigin = normalizeOrigin(config.frontendUrl)
  const tokens = createSessionTokens(db, config)

  const app = new Elysia({ aot: false, normalize: "typebox" })
    .onError(({ code, set }) => {
      if (code === "NOT_FOUND") {
        set.status = 404
        return { success: false, error: { code: "NOT_FOUND", message: "Route not found." } }
      }
      if (code === "VALIDATION" || code === "PARSE") {
        set.status = 400
        return { success: false, error: { code: "INVALID_REQUEST", message: "Invalid request." } }
      }
      set.status = 500
      console.error(JSON.stringify({ event: "request.failed", kind: code }))
      return { success: false, error: { code: "INTERNAL_ERROR", message: "Request failed." } }
    })
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

          return origin === frontendOrigin
        },
        credentials: true,
      }),
    )
    .decorate("accessTokens", tokens.access)
    .decorate("sessions", tokens)
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
            { name: "Authentication", description: "OTP, passkeys, and token management." },
            { name: "Habits", description: "Habit CRUD and period queries." },
            { name: "Habit Logs", description: "Completion log management." },
            { name: "Packages", description: "Registry packages and installation management." },
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
    .use(createAuthRoutes({ db, config, sendOtp: options.sendOtp }))
    .use(createEnrollmentRoutes({ db, config }))
    .use(createPasskeyRoutes({ db, config }))
    .use(createOfflineRoutes({ db, config }))
    .use(createHabitRoutes({ db, config }))
    .use(createPackageRoutes({ db, config, packageRegistry: options.packageRegistry }))

  return {
    app,
    db,
    config,
  }
}

function ok<T>(data: T) {
  return {
    success: true as const,
    data,
  }
}

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin
  } catch {
    return value
  }
}

export type BackendDatabase = AppDatabase
