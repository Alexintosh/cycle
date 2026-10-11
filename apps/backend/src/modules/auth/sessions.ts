import { and, eq, gt } from "drizzle-orm"
import type { AppDatabase } from "../../db/client.ts"
import type { AppConfig } from "../../config.ts"
import { sessions } from "../../db/schema.ts"

export async function hashToken(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function ttl(value: string) {
  const match = /^(\d+)([smhd])$/.exec(value)
  if (!match) throw new Error("Invalid session TTL")
  return Number(match[1]) * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]]!)
}

function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function createSessionTokens(db: AppDatabase, config: AppConfig) {
  async function issue(userId: string) {
    const token = randomToken(), refreshToken = randomToken(), now = Date.now()
    await db.insert(sessions).values({
      id: crypto.randomUUID(), userId,
      accessHash: await hashToken(token), refreshHash: await hashToken(refreshToken),
      expiresAt: new Date(now + ttl(config.accessTokenTtl)),
      refreshExpiresAt: new Date(now + ttl(config.refreshTokenTtl)),
    })
    return { token, refreshToken }
  }
  return {
    issue,
    access: {
      async verify(token: string) {
        const [session] = await db.select().from(sessions).where(and(
          eq(sessions.accessHash, await hashToken(token)), gt(sessions.expiresAt, new Date()),
        )).limit(1)
        return session ? { sub: session.userId } : false
      },
    },
    async rotate(refreshToken: string) {
      // DELETE RETURNING makes refresh consumption single-use, including concurrent requests.
      const [session] = await db.delete(sessions).where(and(
        eq(sessions.refreshHash, await hashToken(refreshToken)), gt(sessions.refreshExpiresAt, new Date()),
      )).returning()
      return session ? issue(session.userId) : null
    },
    async revoke(token: string) {
      await db.delete(sessions).where(eq(sessions.accessHash, await hashToken(token)))
    },
  }
}
