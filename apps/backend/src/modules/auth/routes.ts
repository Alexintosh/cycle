import { and, desc, eq, gte, isNull, sql } from "drizzle-orm"
import { Elysia, t } from "elysia"
import type { AppConfig } from "../../config.ts"
import type { AppDatabase } from "../../db/client.ts"
import { oneTimePasswords, users } from "../../db/schema.ts"
import { ok, fail } from "../../lib/api.ts"
import { seedStarterHabitsForUser } from "../../db/seed.ts"
import { getAuthenticatedUser } from "../../plugins/auth.ts"
import { generateOtp, sendOtpEmail } from "../../services/otp.ts"

type RouteContext = any

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function defaultDisplayName(email: string) {
  return email.split("@")[0] || "habit-user"
}

function authMode(config: AppConfig) {
  return config.authBypassEnabled ? "bypass" : "standard"
}

export function createAuthRoutes(services: {
  db: AppDatabase
  config: AppConfig
}) {
  const { db, config } = services

  return new Elysia({ prefix: "/auth" })
    .get(
      "/mode",
      () =>
        ok({
          mode: authMode(config),
        }),
      {
        detail: {
          tags: ["Authentication"],
          summary: "Authentication mode",
          description: "Return the current authentication mode for the deployment.",
        },
      },
    )
    .post(
      "/request-otp",
      async (context: RouteContext) => {
        const { body, set } = context

        if (config.authBypassEnabled) {
          return fail(set, 403, "AUTH_BYPASS_ENABLED", "Authentication is managed by deployment configuration.")
        }

        const email = normalizeEmail(body.email)
        const now = new Date()
        const requestWindowStart = new Date(now.getTime() - config.otpRequestWindowMinutes * 60_000)

        const [rateLimitRow] = await db
          .select({
            count: sql<number>`count(*)`,
          })
          .from(oneTimePasswords)
          .where(and(eq(oneTimePasswords.email, email), gte(oneTimePasswords.createdAt, requestWindowStart)))

        if ((rateLimitRow?.count ?? 0) >= config.otpRequestLimit) {
          return fail(
            set,
            429,
            "RATE_LIMITED",
            "Too many OTP requests. Please try again later.",
            {
              retryAfterMinutes: config.otpRequestWindowMinutes,
            },
          )
        }

        const [existingActiveOtp] = await db
          .select()
          .from(oneTimePasswords)
          .where(
            and(
              eq(oneTimePasswords.email, email),
              isNull(oneTimePasswords.usedAt),
              gte(oneTimePasswords.expiresAt, now),
            ),
          )
          .orderBy(desc(oneTimePasswords.createdAt))
          .limit(1)

        const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1)

        if (existingActiveOtp) {
          return ok({
            email,
            expiresAt: existingActiveOtp.expiresAt.toISOString(),
            isNewUser: !existingUser,
            reusedExistingCode: true,
          })
        }

        const code = generateOtp()
        const expiresAt = new Date(now.getTime() + config.otpExpiryMinutes * 60_000)

        await db.insert(oneTimePasswords).values({
          id: crypto.randomUUID(),
          email,
          code,
          attempts: 0,
          maxAttempts: config.otpMaxAttempts,
          expiresAt,
          createdAt: now,
        })

        try {
          await sendOtpEmail(config, email, code)
        } catch (error) {
          console.error("Failed to send OTP email:", error)
          return fail(set, 500, "EMAIL_SEND_FAILED", "Failed to send verification email.")
        }

        return ok({
          email,
          expiresAt: expiresAt.toISOString(),
          isNewUser: !existingUser,
          reusedExistingCode: false,
        })
      },
      {
        body: t.Object({
          email: t.String({ format: "email" }),
        }),
        detail: {
          tags: ["Authentication"],
          summary: "Request OTP",
          description: "Send a one-time password to the supplied email.",
        },
      },
    )
    .post(
      "/verify-otp",
      async (context: RouteContext) => {
        const { body, set, accessJwt, refreshJwt } = context

        if (config.authBypassEnabled) {
          return fail(set, 403, "AUTH_BYPASS_ENABLED", "Authentication is managed by deployment configuration.")
        }

        const email = normalizeEmail(body.email)
        const code = body.code.trim()

        const [otp] = await db
          .select()
          .from(oneTimePasswords)
          .where(eq(oneTimePasswords.email, email))
          .orderBy(desc(oneTimePasswords.createdAt))
          .limit(1)

        if (!otp) {
          return fail(set, 400, "NO_OTP_FOUND", "No verification code found. Please request a new one.")
        }

        if (otp.usedAt) {
          return fail(set, 400, "CODE_ALREADY_USED", "This verification code has already been used.")
        }

        if (new Date() > otp.expiresAt) {
          return fail(set, 400, "CODE_EXPIRED", "This verification code has expired.")
        }

        if (otp.attempts >= otp.maxAttempts) {
          return fail(set, 400, "MAX_ATTEMPTS_EXCEEDED", "Too many verification attempts. Please request a new code.")
        }

        if (otp.code !== code) {
          const attempts = otp.attempts + 1
          await db
            .update(oneTimePasswords)
            .set({ attempts })
            .where(eq(oneTimePasswords.id, otp.id))

          return fail(set, 400, "INVALID_CODE", "Invalid verification code.", {
            attemptsRemaining: Math.max(otp.maxAttempts - attempts, 0),
          })
        }

        const now = new Date()
        await db
          .update(oneTimePasswords)
          .set({
            usedAt: now,
            attempts: otp.attempts + 1,
          })
          .where(eq(oneTimePasswords.id, otp.id))

        let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
        const displayName = body.displayName?.trim()

        if (!user) {
          const [createdUser] = await db
            .insert(users)
            .values({
              id: crypto.randomUUID(),
              email,
              displayName: displayName || defaultDisplayName(email),
              createdAt: now,
              updatedAt: now,
              lastLoginAt: now,
            })
            .returning()

          user = createdUser
        } else {
          const [updatedUser] = await db
            .update(users)
            .set({
              displayName: displayName || user.displayName,
              updatedAt: now,
              lastLoginAt: now,
            })
            .where(eq(users.id, user.id))
            .returning()

          user = updatedUser
        }

        try {
          await seedStarterHabitsForUser(db, user.id)
        } catch (error) {
          console.error("Failed to seed starter habits:", error)
        }

        const token = await accessJwt.sign({
          sub: user.id,
          email: user.email,
        })

        const refreshToken = await refreshJwt.sign({
          sub: user.id,
          type: "refresh",
        })

        return ok({
          token,
          refreshToken,
          user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
            authMode: authMode(config),
          },
        })
      },
      {
        body: t.Object({
          email: t.String({ format: "email" }),
          code: t.String({ minLength: 6, maxLength: 6 }),
          displayName: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
        }),
        detail: {
          tags: ["Authentication"],
          summary: "Verify OTP",
          description: "Verify an OTP and receive access and refresh tokens.",
        },
      },
    )
    .post(
      "/refresh",
      async (context: RouteContext) => {
        const { body, set, accessJwt, refreshJwt } = context

        if (config.authBypassEnabled) {
          return fail(set, 403, "AUTH_BYPASS_ENABLED", "Authentication is managed by deployment configuration.")
        }

        const payload = await refreshJwt.verify(body.refreshToken)

        if (!payload || typeof payload !== "object" || !("sub" in payload) || payload.type !== "refresh") {
          return fail(set, 401, "INVALID_TOKEN", "Invalid or expired refresh token.")
        }

        const [user] = await db.select().from(users).where(eq(users.id, String(payload.sub))).limit(1)
        if (!user) {
          return fail(set, 401, "INVALID_TOKEN", "Invalid or expired refresh token.")
        }

        const token = await accessJwt.sign({
          sub: user.id,
          email: user.email,
        })

        const refreshToken = await refreshJwt.sign({
          sub: user.id,
          type: "refresh",
        })

        return ok({
          token,
          refreshToken,
        })
      },
      {
        body: t.Object({
          refreshToken: t.String(),
        }),
        detail: {
          tags: ["Authentication"],
          summary: "Refresh tokens",
          description: "Exchange a refresh token for a new token pair.",
        },
      },
    )
    .get(
      "/me",
      async (context: RouteContext) => {
        const { headers, set, accessJwt } = context
        const user = await getAuthenticatedUser({
          authorization: headers.authorization,
          set,
          accessJwt,
          db,
        })

        if (!user) {
          return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
        }

        try {
          await seedStarterHabitsForUser(db, user.id)
        } catch (error) {
          console.error("Failed to repair starter habits for /auth/me:", error)
        }

        return ok({
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
          authMode: authMode(config),
        })
      },
      {
        detail: {
          tags: ["Authentication"],
          summary: "Current user",
          description: "Return the currently authenticated user.",
        },
      },
    )
    .post(
      "/logout",
      ({ set }) => {
        if (config.authBypassEnabled) {
          return fail(set, 403, "AUTH_BYPASS_ENABLED", "Authentication is managed by deployment configuration.")
        }

        return ok({
          message: "Logged out successfully.",
        })
      },
      {
        detail: {
          tags: ["Authentication"],
          summary: "Logout",
          description: "Stateless logout endpoint for client token cleanup.",
        },
      },
    )
}
