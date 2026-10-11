import { generateRegistrationOptions, verifyRegistrationResponse, type RegistrationResponseJSON } from "@simplewebauthn/server"
import { and, eq, gt, isNull, or } from "drizzle-orm"
import { Elysia, t } from "elysia"
import type { AppConfig } from "../../config.ts"
import type { AppDatabase } from "../../db/client.ts"
import { authEnrollments, recoveryCodes, passkeys, users, sessions } from "../../db/schema.ts"
import { runBatch } from "../../db/batch.ts"
import { seedStarterHabitsForUser } from "../../db/seed.ts"
import { fail, ok } from "../../lib/api.ts"
import { getAuthenticatedUser } from "../../plugins/auth.ts"
import { allowAuthRequest } from "./rate-limit.ts"
import { hashToken } from "./sessions.ts"
import { encodeUserId, getExpectedOrigins, getExpectedRpId, PASSKEY_CHALLENGE_TTL_MS, SUPPORTED_WEBAUTHN_ALGORITHMS, toBase64Url, serializeTransports } from "./passkeys.ts"

export const normalizeRecoveryCode = (code: string) => code.replace(/[\s-]/g, "").toLowerCase()
export const recoveryHash = (email: string, code: string) => hashToken(`${email}:${normalizeRecoveryCode(code)}`)
async function newCodes(email: string, userId: string) {
  const codes = Array.from({ length: 8 }, () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("").match(/.{8}/g)!.join("-"))
  const rows = await Promise.all(codes.map(async code => ({ hash: await recoveryHash(email, code), userId, expiresAt: null })))
  return { codes, rows }
}

export function createEnrollmentRoutes({ db, config }: { db: AppDatabase; config: AppConfig }) {
  async function limited(context: any, email: string) {
    const ip = context.request.headers.get("cf-connecting-ip")
    return await allowAuthRequest(db, `enroll:${email}`, 10, 60) && (!ip || await allowAuthRequest(db, `enroll-ip:${ip}`, 60, 60))
  }
  return new Elysia({ aot: false, normalize: "typebox", prefix: "/auth" })
    .post("/enroll/options", async (context: any) => {
      const { body, set } = context
      if (config.authBypassEnabled) return fail(set, 403, "AUTH_BYPASS_ENABLED", "Authentication is managed by deployment configuration.")
      const email = body.email.trim().toLowerCase()
      if (!await limited(context, email)) return fail(set, 429, "RATE_LIMITED", "Too many attempts. Try again later.")
      const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1)
      let proof: string | null = null
      if (body.recoveryCode) {
        proof = await recoveryHash(email, body.recoveryCode)
        const [code] = await db.select().from(recoveryCodes).where(and(eq(recoveryCodes.hash, proof), or(isNull(recoveryCodes.expiresAt), gt(recoveryCodes.expiresAt, new Date())))).limit(1)
        if (!existing || !code || code.userId !== existing.id) return fail(set, 400, "RECOVERY_INVALID", "The setup or recovery code is invalid or expired.")
      } else if (existing) {
        return fail(set, 409, "ACCOUNT_EXISTS", "This account already exists. Use its passkey or a setup/recovery code.")
      }
      const userId = existing?.id ?? crypto.randomUUID()
      const displayName = existing?.displayName ?? (body.displayName?.trim() || email.split("@")[0])
      const options = await generateRegistrationOptions({
        rpName: config.webauthnRpName, rpID: getExpectedRpId(config), userName: email,
        userDisplayName: displayName, userID: encodeUserId(userId), attestationType: "none",
        supportedAlgorithmIDs: [...SUPPORTED_WEBAUTHN_ALGORITHMS],
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
      })
      const challengeId = crypto.randomUUID()
      await db.insert(authEnrollments).values({ id: challengeId, email, displayName, userId, challenge: options.challenge, webauthnUserId: options.user.id, recoveryHash: proof, expiresAt: new Date(Date.now() + PASSKEY_CHALLENGE_TTL_MS) })
      return ok({ challengeId, options })
    }, { body: t.Object({ email: t.String({ format: "email", maxLength: 254 }), displayName: t.Optional(t.String({ maxLength: 80 })), recoveryCode: t.Optional(t.String({ minLength: 1, maxLength: 128 })) }) })
    .post("/enroll/verify", async (context: any) => {
      const { body, set } = context
      if (config.authBypassEnabled) return fail(set, 403, "AUTH_BYPASS_ENABLED", "Authentication is managed by deployment configuration.")
      const [pending] = await db.delete(authEnrollments).where(and(eq(authEnrollments.id, body.challengeId), gt(authEnrollments.expiresAt, new Date()))).returning()
      if (!pending) return fail(set, 400, "PASSKEY_CHALLENGE_INVALID", "The registration request is invalid or expired. Start again.")
      let verified
      try {
        verified = await verifyRegistrationResponse({ response: body.response as RegistrationResponseJSON, expectedChallenge: pending.challenge, expectedOrigin: getExpectedOrigins(config), expectedRPID: getExpectedRpId(config), requireUserVerification: true, supportedAlgorithmIDs: [...SUPPORTED_WEBAUTHN_ALGORITHMS] })
      } catch {
        return fail(set, 400, "PASSKEY_REGISTRATION_FAILED", "The passkey could not be verified. Start again.")
      }
      if (!verified.verified) return fail(set, 400, "PASSKEY_REGISTRATION_FAILED", "The passkey could not be verified.")
      if (pending.recoveryHash) {
        const [consumed] = await db.delete(recoveryCodes).where(and(eq(recoveryCodes.hash, pending.recoveryHash), eq(recoveryCodes.userId, pending.userId), or(isNull(recoveryCodes.expiresAt), gt(recoveryCodes.expiresAt, new Date())))).returning()
        if (!consumed) return fail(set, 400, "RECOVERY_INVALID", "The recovery code has expired or has already been used.")
      }
      const now = new Date(), credential = verified.registrationInfo.credential
      const recovery = await newCodes(pending.email, pending.userId)
      const operations: any[] = pending.recoveryHash ? [
        db.delete(sessions).where(eq(sessions.userId, pending.userId)),
        db.delete(recoveryCodes).where(eq(recoveryCodes.userId, pending.userId)),
        // Recovery replaces possibly lost/compromised credentials.
        db.delete(passkeys).where(eq(passkeys.userId, pending.userId)),
        db.update(users).set({ lastLoginAt: now, updatedAt: now }).where(eq(users.id, pending.userId)),
      ] : [db.insert(users).values({ id: pending.userId, email: pending.email, displayName: pending.displayName, createdAt: now, updatedAt: now, lastLoginAt: now })]
      operations.push(db.insert(passkeys).values({ id: credential.id, userId: pending.userId, webauthnUserId: pending.webauthnUserId, name: "Primary passkey", publicKey: toBase64Url(credential.publicKey), counter: credential.counter, transports: serializeTransports(body.response.response?.transports), deviceType: verified.registrationInfo.credentialDeviceType, backedUp: verified.registrationInfo.credentialBackedUp, createdAt: now, lastUsedAt: now }))
      for (const row of recovery.rows) operations.push(db.insert(recoveryCodes).values(row))
      try { await runBatch(db, operations) } catch {
        return fail(set, 409, "REGISTRATION_CONFLICT", "Registration could not be completed. Use your existing passkey or start again.")
      }
      if (!pending.recoveryHash) await seedStarterHabitsForUser(db, pending.userId)
      const tokens = await context.sessions.issue(pending.userId)
      return ok({ ...tokens, user: { id: pending.userId, email: pending.email, displayName: pending.displayName, lastLoginAt: now.toISOString(), authMode: "standard" }, recoveryCodes: recovery.codes })
    }, { body: t.Object({ challengeId: t.String(), response: t.Any() }) })
    .post("/recovery-codes", async (context: any) => {
      const user = await getAuthenticatedUser({ authorization: context.headers.authorization, set: context.set, accessTokens: context.accessTokens, db, config })
      if (!user || config.authBypassEnabled) return fail(context.set, 401, "UNAUTHORIZED", "Authentication is required.")
      const recovery = await newCodes(user.email, user.id)
      await runBatch(db, [db.delete(recoveryCodes).where(eq(recoveryCodes.userId, user.id)), ...recovery.rows.map(row => db.insert(recoveryCodes).values(row))])
      return ok({ recoveryCodes: recovery.codes })
    })
}
