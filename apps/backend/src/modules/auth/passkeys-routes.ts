import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
  WebAuthnCredential,
} from "@simplewebauthn/server"
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server"
import { and, desc, eq, lt } from "drizzle-orm"
import { Elysia, t } from "elysia"
import type { AppConfig } from "../../config.ts"
import type { AppDatabase } from "../../db/client.ts"
import { passkeys, users, webauthnChallenges, type UserRecord } from "../../db/schema.ts"
import { fail, ok } from "../../lib/api.ts"
import { getAuthenticatedUser } from "../../plugins/auth.ts"
import {
  encodeUserId,
  formatPasskeyName,
  fromBase64Url,
  getExpectedOrigins,
  getExpectedRpId,
  PASSKEY_CHALLENGE_TTL_MS,
  parseTransports,
  serializeTransports,
  SUPPORTED_WEBAUTHN_ALGORITHMS,
  toBase64Url,
  toPasskeySummary,
} from "./passkeys.ts"

type RouteContext = any
type ChallengePurpose = "registration" | "authentication"

function serializeUser(user: UserRecord, config: AppConfig) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    authMode: config.authBypassEnabled ? ("bypass" as const) : ("standard" as const),
  }
}

async function issueSession(context: RouteContext, user: UserRecord, config: AppConfig) {
  const { accessJwt, refreshJwt } = context
  const token = await accessJwt.sign({
    sub: user.id,
    email: user.email,
  })

  const refreshToken = await refreshJwt.sign({
    sub: user.id,
    type: "refresh",
  })

  return {
    token,
    refreshToken,
    user: serializeUser(user, config),
  }
}

async function cleanupExpiredChallenges(db: AppDatabase) {
  await db.delete(webauthnChallenges).where(lt(webauthnChallenges.expiresAt, new Date()))
}

async function createChallenge(input: {
  db: AppDatabase
  purpose: ChallengePurpose
  challenge: string
  userId?: string
  webauthnUserId?: string
}) {
  const now = new Date()
  const challengeId = crypto.randomUUID()

  await cleanupExpiredChallenges(input.db)

  if (input.userId) {
    await input.db
      .delete(webauthnChallenges)
      .where(and(eq(webauthnChallenges.userId, input.userId), eq(webauthnChallenges.purpose, input.purpose)))
  }

  await input.db.insert(webauthnChallenges).values({
    id: challengeId,
    userId: input.userId ?? null,
    purpose: input.purpose,
    challenge: input.challenge,
    webauthnUserId: input.webauthnUserId ?? null,
    createdAt: now,
    expiresAt: new Date(now.getTime() + PASSKEY_CHALLENGE_TTL_MS),
  })

  return challengeId
}

async function consumeChallenge(input: {
  db: AppDatabase
  challengeId: string
  purpose: ChallengePurpose
}) {
  const [challenge] = await input.db
    .select()
    .from(webauthnChallenges)
    .where(and(eq(webauthnChallenges.id, input.challengeId), eq(webauthnChallenges.purpose, input.purpose)))
    .limit(1)

  if (!challenge) {
    return null
  }

  await input.db.delete(webauthnChallenges).where(eq(webauthnChallenges.id, challenge.id))

  if (challenge.expiresAt.getTime() < Date.now()) {
    return null
  }

  return challenge
}

async function updateLastLogin(db: AppDatabase, userId: string) {
  const now = new Date()
  const [user] = await db
    .update(users)
    .set({
      updatedAt: now,
      lastLoginAt: now,
    })
    .where(eq(users.id, userId))
    .returning()

  return user ?? null
}

function toWebAuthnCredential(input: {
  credentialId: string
  publicKey: string
  counter: number
  transports: AuthenticatorTransportFuture[]
}): WebAuthnCredential {
  return {
    id: input.credentialId,
    publicKey: fromBase64Url(input.publicKey),
    counter: input.counter,
    transports: input.transports,
  }
}

export function createPasskeyRoutes(services: {
  db: AppDatabase
  config: AppConfig
}) {
  const { db, config } = services
  const bypassDisabledResponse = (set: { status?: number | string }) =>
    fail(set, 403, "AUTH_BYPASS_ENABLED", "Authentication is managed by deployment configuration.")

  return new Elysia({ prefix: "/auth/passkeys" })
    .get(
      "/",
      async (context: RouteContext) => {
        const { headers, set, accessJwt } = context

        if (config.authBypassEnabled) {
          return bypassDisabledResponse(set)
        }

        const user = await getAuthenticatedUser({
          authorization: headers.authorization,
          set,
          accessJwt,
          db,
        })

        if (!user) {
          return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
        }

        const rows = await db.select().from(passkeys).where(eq(passkeys.userId, user.id)).orderBy(desc(passkeys.lastUsedAt), desc(passkeys.createdAt))
        return ok(rows.map(toPasskeySummary))
      },
      {
        detail: {
          tags: ["Authentication"],
          summary: "List passkeys",
          description: "List passkeys registered to the authenticated account.",
        },
      },
    )
    .post(
      "/register/options",
      async (context: RouteContext) => {
        const { headers, set, accessJwt } = context

        if (config.authBypassEnabled) {
          return bypassDisabledResponse(set)
        }

        const user = await getAuthenticatedUser({
          authorization: headers.authorization,
          set,
          accessJwt,
          db,
        })

        if (!user) {
          return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
        }

        const existingPasskeys = await db.select().from(passkeys).where(eq(passkeys.userId, user.id))
        const options = await generateRegistrationOptions({
          rpName: config.webauthnRpName,
          rpID: getExpectedRpId(config),
          userName: user.email,
          userDisplayName: user.displayName,
          userID: encodeUserId(user.id),
          attestationType: "none",
          supportedAlgorithmIDs: [...SUPPORTED_WEBAUTHN_ALGORITHMS],
          excludeCredentials: existingPasskeys.map((entry) => ({
            id: entry.id,
            transports: parseTransports(entry.transports),
          })),
          authenticatorSelection: {
            residentKey: "required",
            userVerification: "required",
          },
        })

        const challengeId = await createChallenge({
          db,
          userId: user.id,
          purpose: "registration",
          challenge: options.challenge,
          webauthnUserId: options.user.id,
        })

        return ok({
          challengeId,
          options,
        })
      },
      {
        detail: {
          tags: ["Authentication"],
          summary: "Begin passkey registration",
          description: "Create WebAuthn registration options for the authenticated account.",
        },
      },
    )
    .post(
      "/register/verify",
      async (context: RouteContext) => {
        const { body, headers, set, accessJwt } = context

        if (config.authBypassEnabled) {
          return bypassDisabledResponse(set)
        }

        const user = await getAuthenticatedUser({
          authorization: headers.authorization,
          set,
          accessJwt,
          db,
        })

        if (!user) {
          return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
        }

        const challenge = await consumeChallenge({
          db,
          challengeId: body.challengeId,
          purpose: "registration",
        })

        if (!challenge || challenge.userId !== user.id) {
          return fail(set, 400, "PASSKEY_CHALLENGE_INVALID", "The passkey registration challenge is invalid or expired.")
        }

        let verification
        try {
          verification = await verifyRegistrationResponse({
            response: body.response as RegistrationResponseJSON,
            expectedChallenge: challenge.challenge,
            expectedOrigin: getExpectedOrigins(config),
            expectedRPID: getExpectedRpId(config),
            requireUserVerification: true,
            supportedAlgorithmIDs: [...SUPPORTED_WEBAUTHN_ALGORITHMS],
          })
        } catch (error) {
          console.error("Failed to verify passkey registration:", error)
          return fail(set, 400, "PASSKEY_REGISTRATION_FAILED", "The passkey registration could not be verified.")
        }

        if (!verification.verified) {
          return fail(set, 400, "PASSKEY_REGISTRATION_FAILED", "The passkey registration could not be verified.")
        }

        const credential = verification.registrationInfo.credential
        const [existingPasskey] = await db.select().from(passkeys).where(eq(passkeys.id, credential.id)).limit(1)
        if (existingPasskey) {
          if (existingPasskey.userId === user.id) {
            return ok({ passkey: toPasskeySummary(existingPasskey) })
          }

          return fail(set, 409, "PASSKEY_ALREADY_REGISTERED", "That passkey is already registered to another account.")
        }

        const createdAt = new Date()
        const [createdPasskey] = await db
          .insert(passkeys)
          .values({
            id: credential.id,
            userId: user.id,
            webauthnUserId: challenge.webauthnUserId ?? user.id,
            name: formatPasskeyName(body.name, createdAt),
            publicKey: toBase64Url(credential.publicKey),
            counter: credential.counter,
            transports: serializeTransports(body.response.response?.transports),
            deviceType: verification.registrationInfo.credentialDeviceType,
            backedUp: verification.registrationInfo.credentialBackedUp,
            createdAt,
            lastUsedAt: null,
          })
          .returning()

        return ok({
          passkey: toPasskeySummary(createdPasskey),
        })
      },
      {
        body: t.Object({
          challengeId: t.String(),
          name: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
          response: t.Any(),
        }),
        detail: {
          tags: ["Authentication"],
          summary: "Finish passkey registration",
          description: "Verify a WebAuthn registration response and save the passkey.",
        },
      },
    )
    .post(
      "/authenticate/options",
      async ({ set }) => {
        if (config.authBypassEnabled) {
          return bypassDisabledResponse(set)
        }

        const options = await generateAuthenticationOptions({
          rpID: getExpectedRpId(config),
          userVerification: "required",
        })

        const challengeId = await createChallenge({
          db,
          purpose: "authentication",
          challenge: options.challenge,
        })

        return ok({
          challengeId,
          options,
        })
      },
      {
        detail: {
          tags: ["Authentication"],
          summary: "Begin passkey authentication",
          description: "Create WebAuthn authentication options for a usernameless passkey sign-in flow.",
        },
      },
    )
    .post(
      "/authenticate/verify",
      async (context: RouteContext) => {
        const { body, set } = context

        if (config.authBypassEnabled) {
          return bypassDisabledResponse(set)
        }

        const challenge = await consumeChallenge({
          db,
          challengeId: body.challengeId,
          purpose: "authentication",
        })

        if (!challenge) {
          return fail(set, 400, "PASSKEY_CHALLENGE_INVALID", "The passkey authentication challenge is invalid or expired.")
        }

        const [storedPasskey] = await db.select().from(passkeys).where(eq(passkeys.id, body.response.id)).limit(1)
        if (!storedPasskey) {
          return fail(set, 404, "PASSKEY_NOT_FOUND", "No account matched the supplied passkey.")
        }

        const [user] = await db.select().from(users).where(eq(users.id, storedPasskey.userId)).limit(1)
        if (!user) {
          return fail(set, 404, "USER_NOT_FOUND", "No account matched the supplied passkey.")
        }

        let verification
        try {
          verification = await verifyAuthenticationResponse({
            response: body.response as AuthenticationResponseJSON,
            expectedChallenge: challenge.challenge,
            expectedOrigin: getExpectedOrigins(config),
            expectedRPID: getExpectedRpId(config),
            requireUserVerification: true,
            credential: toWebAuthnCredential({
              credentialId: storedPasskey.id,
              publicKey: storedPasskey.publicKey,
              counter: storedPasskey.counter,
              transports: parseTransports(storedPasskey.transports),
            }),
          })
        } catch (error) {
          console.error("Failed to verify passkey authentication:", error)
          return fail(set, 400, "PASSKEY_AUTHENTICATION_FAILED", "The passkey authentication could not be verified.")
        }

        if (!verification.verified) {
          return fail(set, 400, "PASSKEY_AUTHENTICATION_FAILED", "The passkey authentication could not be verified.")
        }

        const now = new Date()
        await db
          .update(passkeys)
          .set({
            counter: verification.authenticationInfo.newCounter,
            deviceType: verification.authenticationInfo.credentialDeviceType,
            backedUp: verification.authenticationInfo.credentialBackedUp,
            lastUsedAt: now,
          })
          .where(eq(passkeys.id, storedPasskey.id))

        const loggedInUser = (await updateLastLogin(db, user.id)) ?? user

        return ok(await issueSession(context, loggedInUser, config))
      },
      {
        body: t.Object({
          challengeId: t.String(),
          response: t.Any(),
        }),
        detail: {
          tags: ["Authentication"],
          summary: "Finish passkey authentication",
          description: "Verify a WebAuthn authentication response and issue session tokens.",
        },
      },
    )
    .delete(
      "/:passkeyId",
      async (context: RouteContext) => {
        const { headers, params, set, accessJwt } = context

        if (config.authBypassEnabled) {
          return bypassDisabledResponse(set)
        }

        const user = await getAuthenticatedUser({
          authorization: headers.authorization,
          set,
          accessJwt,
          db,
        })

        if (!user) {
          return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
        }

        const [ownedPasskey] = await db
          .select()
          .from(passkeys)
          .where(and(eq(passkeys.id, params.passkeyId), eq(passkeys.userId, user.id)))
          .limit(1)

        if (!ownedPasskey) {
          return fail(set, 404, "PASSKEY_NOT_FOUND", "Passkey not found.")
        }

        await db.delete(passkeys).where(eq(passkeys.id, ownedPasskey.id))

        return ok({
          removed: true,
        })
      },
      {
        params: t.Object({
          passkeyId: t.String(),
        }),
        detail: {
          tags: ["Authentication"],
          summary: "Delete passkey",
          description: "Delete a passkey registered to the authenticated account.",
        },
      },
    )
}
