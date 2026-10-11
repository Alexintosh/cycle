import { sql } from "drizzle-orm"
import type { AppDatabase } from "../../db/client.ts"
import { authRateLimits } from "../../db/schema.ts"
import { hashToken } from "./sessions.ts"

export async function allowAuthRequest(db: AppDatabase, subject: string, maximum: number, minutes: number) {
  const now = Math.floor(Date.now() / 1000), key = await hashToken(subject)
  const [allowed] = await db.insert(authRateLimits).values({
    key, count: 1, expiresAt: now + minutes * 60,
  }).onConflictDoUpdate({
    target: authRateLimits.key,
    set: {
      count: sql`CASE WHEN ${authRateLimits.expiresAt} <= ${now} THEN 1 ELSE ${authRateLimits.count} + 1 END`,
      expiresAt: sql`CASE WHEN ${authRateLimits.expiresAt} <= ${now} THEN ${now + minutes * 60} ELSE ${authRateLimits.expiresAt} END`,
    },
    setWhere: sql`${authRateLimits.expiresAt} <= ${now} OR ${authRateLimits.count} < ${maximum}`,
  }).returning()
  return Boolean(allowed)
}
