import { eq } from "drizzle-orm"
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

export async function getAuthenticatedUser(input: {
  authorization?: string
  set: { status?: number | string }
  accessJwt: JwtVerifier
  db: AppDatabase
}): Promise<UserRecord | null> {
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
