import { and, eq, sql } from "drizzle-orm"
import { Elysia, t } from "elysia"
import type { AppConfig } from "../../config.ts"
import type { AppDatabase } from "../../db/client.ts"
import { habits, habitLogs, offlineMutations } from "../../db/schema.ts"
import { runBatch } from "../../db/batch.ts"
import { getAuthenticatedUser } from "../../plugins/auth.ts"
import { hashToken } from "../auth/sessions.ts"
import { assertIsoDate } from "../../lib/date.ts"
import { fail, ok } from "../../lib/api.ts"

export function createOfflineRoutes({ db, config }: { db: AppDatabase; config: AppConfig }) {
  return new Elysia({ aot: false, normalize: "typebox" })
    .post("/habits/sync", async (context: any) => {
      const { body, set } = context
      const user = await getAuthenticatedUser({ authorization: context.headers.authorization, set, accessTokens: context.accessTokens, db, config })
      if (!user) return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
      let date: string
      try { date = assertIsoDate(body.date) } catch { return fail(set, 400, "INVALID_DATE", "Invalid completion date.") }
      const loggedAt = new Date(body.loggedAt)
      if (Number.isNaN(loggedAt.getTime())) return fail(set, 400, "INVALID_TIMESTAMP", "Invalid completion timestamp.")
      if (body.kind === "set-day" && typeof body.completed !== "boolean") return fail(set, 400, "INVALID_REQUEST", "A completed status is required.")
      const count = body.kind === "add-log" ? body.count ?? 1 : 1
      const hash = await hashToken(JSON.stringify({ id: body.id, habitId: body.habitId, kind: body.kind, date, loggedAt: loggedAt.toISOString(), count, completed: body.kind === "set-day" ? body.completed : null }))
      const markerWhere = and(eq(offlineMutations.userId, user.id), eq(offlineMutations.id, body.id))
      const [previous] = await db.select().from(offlineMutations).where(markerWhere).limit(1)
      if (previous) return previous.requestHash === hash ? ok({ synced: true, replayed: true }) : fail(set, 409, "SYNC_CONFLICT", "This check-in identifier has already been used.")
      const [owned] = await db.select({ id: habits.id }).from(habits).where(and(eq(habits.id, body.habitId), eq(habits.userId, user.id))).limit(1)
      if (!owned) return fail(set, 404, "HABIT_REMOVED", "This ritual no longer exists. The local check-in has been kept.")
      // The marker and all effects share one D1 transaction. A replay after a lost
      // response cannot add a duplicate log or apply an old toggle again.
      const unused = sql`NOT EXISTS (SELECT 1 FROM offline_mutations WHERE user_id = ${user.id} AND id = ${body.id})`
      const operations: any[] = []
      if (body.kind === "set-day" && !body.completed) {
        operations.push(db.delete(habitLogs).where(and(eq(habitLogs.habitId, body.habitId), eq(habitLogs.logDate, date), unused)))
      } else {
        for (let index = 0; index < count; index++) {
          const noDay = body.kind === "set-day" ? sql`AND NOT EXISTS (SELECT 1 FROM habit_logs WHERE habit_id = ${body.habitId} AND log_date = ${date})` : sql``
          operations.push(db.insert(habitLogs).select(sql`SELECT ${`${body.id}-${index}`}, ${body.habitId}, ${date}, ${Math.floor(loggedAt.getTime()/1000)}, NULL, ${Math.floor(Date.now()/1000)}
            WHERE ${unused} ${noDay}`))
        }
      }
      operations.push(db.insert(offlineMutations).values({ userId: user.id, id: body.id, requestHash: hash, createdAt: new Date() }).onConflictDoNothing())
      await runBatch(db, operations)
      const [marker] = await db.select().from(offlineMutations).where(markerWhere).limit(1)
      if (marker?.requestHash !== hash) return fail(set, 409, "SYNC_CONFLICT", "This check-in identifier has already been used.")
      return ok({ synced: true, replayed: false })
    }, { body: t.Object({ id: t.String({ format: "uuid" }), habitId: t.String(), kind: t.Union([t.Literal("set-day"),t.Literal("add-log")]), date: t.String(), loggedAt: t.String(), completed: t.Optional(t.Boolean()), count: t.Optional(t.Integer({ minimum: 1, maximum: 100 })) }) })
}
