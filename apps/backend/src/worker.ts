import { drizzle } from "drizzle-orm/d1"
import { lt } from "drizzle-orm"
import { createRuntime } from "./app.ts"
import { loadConfig } from "./config.ts"
import { createOtpEmail } from "./services/otp.ts"
import * as schema from "./db/schema.ts"

export type Env = {
  DB: D1Database
  ASSETS: Fetcher
  FRONTEND_URL: string
  JWT_SECRET: string
  EMAIL?: SendEmail
  EMAIL_AUTH_ENABLED?: string
  EMAIL_FROM: string
  NODE_ENV?: string
  AUTH_BYPASS_ENABLED?: string
  WEBAUTHN_RP_ID?: string
  WEBAUTHN_ORIGINS?: string
}

const runtimes = new WeakMap<Env, ReturnType<typeof createRuntime>>()
const nextCleanup = new WeakMap<Env, number>()
function runtime(env: Env) {
  let result = runtimes.get(env)
  if (!result) {
    const config = loadConfig({
      NODE_ENV: env.NODE_ENV ?? "production", FRONTEND_URL: env.FRONTEND_URL,
      JWT_SECRET: env.JWT_SECRET,
      EMAIL_AUTH_ENABLED: env.EMAIL_AUTH_ENABLED, EMAIL_FROM: env.EMAIL_FROM, AUTH_BYPASS_ENABLED: env.AUTH_BYPASS_ENABLED,
      WEBAUTHN_RP_ID: env.WEBAUTHN_RP_ID, WEBAUTHN_ORIGINS: env.WEBAUTHN_ORIGINS,
    })
    if (config.authBypassEnabled) throw new Error("Cloudflare deployments require per-user authentication")
    if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) throw new Error("Set a random JWT_SECRET of at least 32 characters")
    if (config.emailAuthEnabled && (!env.EMAIL || !env.EMAIL_FROM)) throw new Error("Configure email delivery")
    if (config.env === "production" && !config.frontendUrl.startsWith("https://")) throw new Error("Configure an HTTPS FRONTEND_URL")
    result = createRuntime(drizzle(env.DB, { schema }), config, {
      sendOtp: async (config, email, code) => { await env.EMAIL!.send(createOtpEmail(config, email, code)) },
    })
    result.app.compile()
    runtimes.set(env, result)
  }
  return result
}

async function cleanup(env: Env) {
  const { db } = runtime(env)
  const now = new Date()
  await Promise.all([
    db.delete(schema.authEnrollments).where(lt(schema.authEnrollments.expiresAt, now)),
    db.delete(schema.authRateLimits).where(lt(schema.authRateLimits.expiresAt, Math.floor(now.getTime() / 1000))),
    db.delete(schema.sessions).where(lt(schema.sessions.refreshExpiresAt, now)),
    db.delete(schema.webauthnChallenges).where(lt(schema.webauthnChallenges.expiresAt, now)),
    db.delete(schema.oneTimePasswords).where(lt(schema.oneTimePasswords.createdAt, new Date(now.getTime() - 86400000))),
  ])
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url)
    if (url.pathname !== "/api" && !url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request)
    url.pathname = url.pathname.slice(4) || "/"
    try {
      if (Date.now() >= (nextCleanup.get(env) ?? 0)) {
        nextCleanup.set(env, Date.now() + 3600000)
        ctx.waitUntil(cleanup(env).catch(() => { nextCleanup.delete(env) }))
      }
      return await runtime(env).app.handle(new Request(url, request))
    } catch {
      return Response.json({ success: false, error: { code: "CONFIGURATION_ERROR", message: "Service unavailable." } }, { status: 503 })
    }
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(cleanup(env))
  },
} satisfies ExportedHandler<Env>
