import { eq } from "drizzle-orm"
import { loadConfig, type AppConfig } from "../config.ts"
import type { AppDatabase } from "../db/client.ts"
import { users, type UserRecord } from "../db/schema.ts"

type JwtVerifier = {
  verify(token: string): Promise<unknown>
}

function getBearerToken(authorization?: string) {
  if (!authorization?.startsWith("Bearer ")) {
    return null
  }

  return authorization.slice("Bearer ".length)
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function defaultDisplayName(email: string) {
  return email.split("@")[0] || "habit-user"
}

async function ensureBypassUser(db: AppDatabase, config: AppConfig) {
  const email = normalizeEmail(config.authBypassEmail)
  const now = new Date()

  const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (existingUser) {
    const [updatedUser] = await db
      .update(users)
      .set({
        displayName: config.authBypassDisplayName || existingUser.displayName,
        updatedAt: now,
        lastLoginAt: now,
      })
      .where(eq(users.id, existingUser.id))
      .returning()

    return updatedUser
  }

  const [createdUser] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      email,
      displayName: config.authBypassDisplayName || defaultDisplayName(email),
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    })
    .returning()

  return createdUser
}

export async function getAuthenticatedUser(input: {
  authorization?: string
  set: { status?: number | string }
  accessJwt: JwtVerifier
  db: AppDatabase
  config?: AppConfig
}): Promise<UserRecord | null> {
  const config = input.config ?? loadConfig()

  if (config.authBypassEnabled) {
    return ensureBypassUser(input.db, config)
  }

  const token = getBearerToken(input.authorization)
  if (!token) {
    input.set.status = 401
    return null
  }

  const payload = await input.accessJwt.verify(token)
  if (!payload || typeof payload !== "object" || !("sub" in payload) || typeof payload.sub !== "string") {
    input.set.status = 401
    return null
  }

  const [user] = await input.db.select().from(users).where(eq(users.id, payload.sub)).limit(1)
  if (!user) {
    input.set.status = 401
    return null
  }

  return user
}
