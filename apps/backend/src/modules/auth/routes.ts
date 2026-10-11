import { allowAuthRequest } from "./rate-limit.ts"
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm"
import { Elysia, t } from "elysia"
import type { AppConfig } from "../../config.ts"
import type { AppDatabase } from "../../db/client.ts"
import { oneTimePasswords, users } from "../../db/schema.ts"
import { ok, fail } from "../../lib/api.ts"
import { seedStarterHabitsForUser } from "../../db/seed.ts"
import { getAuthenticatedUser } from "../../plugins/auth.ts"
import { generateOtp, hashOtp, sendOtpEmail } from "../../services/otp.ts"

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
  sendOtp?: typeof sendOtpEmail
}) {
  const { db, config } = services

  return new Elysia({ aot: false, normalize: "typebox", prefix: "/auth" })
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

        if (!config.emailAuthEnabled) return fail(set, 403, "EMAIL_AUTH_DISABLED", "Use a passkey or recovery code to access your account.")
        const email = normalizeEmail(body.email)
        const now = new Date()
        const ip = context.request.headers.get("cf-connecting-ip")
        const emailAllowed = await allowAuthRequest(db, `email:${email}`, config.otpRequestLimit, config.otpRequestWindowMinutes)
        const ipAllowed = !ip || await allowAuthRequest(db, `ip:${ip}`, 30, config.otpRequestWindowMinutes)
        if (!emailAllowed || !ipAllowed) {
          return fail(set, 429, "RATE_LIMITED", "Too many OTP requests. Please try again later.")
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

        const otpId = crypto.randomUUID()
        await db.insert(oneTimePasswords).values({
          id: otpId,
          email,
          code: await hashOtp(config, email, code),
          attempts: 0,
          maxAttempts: config.otpMaxAttempts,
          expiresAt,
          createdAt: now,
        })

        try {
          await (services.sendOtp ?? sendOtpEmail)(config, email, code)
        } catch (error) {
          await db.delete(oneTimePasswords).where(eq(oneTimePasswords.id, otpId))
          console.error("Failed to deliver verification email")
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
        const { body, set, sessions } = context

        if (config.authBypassEnabled) {
          return fail(set, 403, "AUTH_BYPASS_ENABLED", "Authentication is managed by deployment configuration.")
        }

        if (!config.emailAuthEnabled) return fail(set, 403, "EMAIL_AUTH_DISABLED", "Use a passkey or recovery code to access your account.")
        const email = normalizeEmail(body.email)
        const code = body.code.trim()

        const [otp] = await db
          .select()
          .from(oneTimePasswords)
          .where(and(eq(oneTimePasswords.email, email), isNull(oneTimePasswords.usedAt)))
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

        if (otp.code !== await hashOtp(config, email, code)) {
          const attempts = otp.attempts + 1
          await db
            .update(oneTimePasswords)
            .set({ attempts: sql`${oneTimePasswords.attempts} + 1` })
            .where(eq(oneTimePasswords.id, otp.id))

          return fail(set, 400, "INVALID_CODE", "Invalid verification code.", {
            attemptsRemaining: Math.max(otp.maxAttempts - attempts, 0),
          })
        }

        const now = new Date()
        const [consumed] = await db.update(oneTimePasswords).set({
          usedAt: now,
          attempts: sql`${oneTimePasswords.attempts} + 1`,
        }).where(and(
          eq(oneTimePasswords.id, otp.id), isNull(oneTimePasswords.usedAt),
          gte(oneTimePasswords.expiresAt, now),
          sql`${oneTimePasswords.attempts} < ${oneTimePasswords.maxAttempts}`,
        )).returning()
        if (!consumed) return fail(set, 400, "CODE_ALREADY_USED", "Verification code is no longer available.")

        let isNewUser = false
        let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
        const displayName = body.displayName?.trim()

        if (!user) {
          isNewUser = true
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
          if (isNewUser) await seedStarterHabitsForUser(db, user.id)
        } catch (error) {
          console.error("Failed to seed starter habits:", error)
        }

        const { token, refreshToken } = await sessions.issue(user.id)

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
        const { body, set, sessions } = context

        if (config.authBypassEnabled) {
          return fail(set, 403, "AUTH_BYPASS_ENABLED", "Authentication is managed by deployment configuration.")
        }

        const tokens = await sessions.rotate(body.refreshToken)
        if (!tokens) return fail(set, 401, "INVALID_TOKEN", "Invalid or expired refresh token.")
        return ok(tokens)
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
        const { headers, set, accessTokens } = context
        const user = await getAuthenticatedUser({
          authorization: headers.authorization,
          set,
          accessTokens,
          db,
          config,
        })

        if (!user) {
          return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
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
      async (context: RouteContext) => {
        const { set, headers, sessions } = context
        if (config.authBypassEnabled) {
          return fail(set, 403, "AUTH_BYPASS_ENABLED", "Authentication is managed by deployment configuration.")
        }

        const token = headers.authorization?.replace(/^Bearer /, "")
        if (token) await sessions.revoke(token)
        return ok({
          message: "Logged out successfully.",
        })
      },
      {
        detail: {
          tags: ["Authentication"],
          summary: "Logout",
          description: "Revoke the current access and refresh session.",
        },
      },
    )
}
