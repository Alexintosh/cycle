import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import { Elysia, t } from "elysia"
import type { AppDatabase } from "../../db/client.ts"
import { habitLogs, habits } from "../../db/schema.ts"
import { ok, fail } from "../../lib/api.ts"
import { assertIsoDate, getTodayIsoDate } from "../../lib/date.ts"
import { isFrequencyKey, listFrequencyDefinitions } from "../../lib/frequencies.ts"
import { getAuthenticatedUser } from "../../plugins/auth.ts"
import { getHabitById, listHabits } from "./service.ts"

type RouteServices = {
  db: AppDatabase
}

type RouteContext = any

function normalizeOptionalString(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function createHabitRoutes({ db }: RouteServices) {
  return new Elysia()
    .get(
      "/frequencies",
      () => ok(listFrequencyDefinitions()),
      {
        detail: {
          tags: ["Metadata"],
          summary: "List supported frequencies",
          description: "Return the built-in frequency definitions used by the API.",
        },
      },
    )
    .get(
      "/categories",
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

        const rows = await db
          .select({
            category: habits.category,
            count: sql<number>`count(*)`,
          })
          .from(habits)
          .where(eq(habits.userId, user.id))
          .groupBy(habits.category)
          .orderBy(asc(habits.category))

        return ok(rows)
      },
      {
        detail: {
          tags: ["Metadata"],
          summary: "List categories",
          description: "Return the authenticated user's current habit categories.",
        },
      },
    )
    .get(
      "/habits",
      async (context: RouteContext) => {
        const { headers, query, set, accessJwt } = context
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
          const habitsWithLogs = await listHabits(db, {
            userId: user.id,
            startDate: query.startDate,
            endDate: query.endDate,
            includeLogs: query.includeLogs === "true",
            category: query.category,
            frequency: query.frequency,
          })

          return ok(habitsWithLogs)
        } catch (error) {
          return fail(set, 400, "INVALID_RANGE", error instanceof Error ? error.message : "Invalid date range.")
        }
      },
      {
        query: t.Object({
          startDate: t.Optional(t.String()),
          endDate: t.Optional(t.String()),
          includeLogs: t.Optional(t.String()),
          category: t.Optional(t.String()),
          frequency: t.Optional(t.String()),
        }),
        detail: {
          tags: ["Habits"],
          summary: "List habits",
          description: "List habits for the authenticated user, optionally including logs for a date range.",
        },
      },
    )
    .get(
      "/habits/completed-non-daily",
      async (context: RouteContext) => {
        const { headers, query, set, accessJwt } = context
        const user = await getAuthenticatedUser({
          authorization: headers.authorization,
          set,
          accessJwt,
          db,
        })

        if (!user) {
          return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
        }

        const date = query.date ? assertIsoDate(query.date) : getTodayIsoDate()
        const rows = await db
          .selectDistinct({
            habitId: habits.id,
          })
          .from(habits)
          .innerJoin(habitLogs, eq(habitLogs.habitId, habits.id))
          .where(and(eq(habits.userId, user.id), sql`${habits.frequency} != 'daily'`, eq(habitLogs.logDate, date)))

        const habitIds = rows.map((row) => row.habitId)
        if (!habitIds.length) {
          return ok([])
        }

        const habitsWithLogs = await listHabits(db, {
          userId: user.id,
          startDate: date,
          endDate: date,
          includeLogs: true,
        })

        return ok(habitsWithLogs.filter((habit) => habitIds.includes(habit.id)))
      },
      {
        query: t.Object({
          date: t.Optional(t.String()),
        }),
        detail: {
          tags: ["Habits"],
          summary: "Completed non-daily habits",
          description: "Return non-daily habits with at least one completion on the specified day.",
        },
      },
    )
    .get(
      "/habits/:habitId",
      async (context: RouteContext) => {
        const { headers, params, query, set, accessJwt } = context
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
          const habit = await getHabitById(db, user.id, params.habitId, {
            startDate: query.startDate,
            endDate: query.endDate,
          })

          if (!habit) {
            return fail(set, 404, "NOT_FOUND", "Habit not found.")
          }

          return ok(habit)
        } catch (error) {
          return fail(set, 400, "INVALID_RANGE", error instanceof Error ? error.message : "Invalid date range.")
        }
      },
      {
        params: t.Object({
          habitId: t.String(),
        }),
        query: t.Object({
          startDate: t.Optional(t.String()),
          endDate: t.Optional(t.String()),
        }),
        detail: {
          tags: ["Habits"],
          summary: "Get habit",
          description: "Return a single habit for the authenticated user.",
        },
      },
    )
    .post(
      "/habits",
      async (context: RouteContext) => {
        const { headers, body, set, accessJwt } = context
        const user = await getAuthenticatedUser({
          authorization: headers.authorization,
          set,
          accessJwt,
          db,
        })

        if (!user) {
          return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
        }

        if (!isFrequencyKey(body.frequency)) {
          return fail(set, 400, "INVALID_FREQUENCY", "Unsupported frequency.")
        }

        const now = new Date()
        const [maxOrderRow] = await db
          .select({
            maxOrder: sql<number>`coalesce(max(${habits.order}), -1)`,
          })
          .from(habits)
          .where(eq(habits.userId, user.id))

        const [habit] = await db
          .insert(habits)
          .values({
            id: crypto.randomUUID(),
            userId: user.id,
            name: body.name.trim(),
            description: normalizeOptionalString(body.description),
            category: body.category.trim() || "OTHER",
            frequency: body.frequency,
            goal: body.goal ?? null,
            color: body.color.trim(),
            emoji: normalizeOptionalString(body.emoji) ?? "✨",
            order: (maxOrderRow?.maxOrder ?? -1) + 1,
            createdAt: now,
            updatedAt: now,
          })
          .returning()

        const response = await getHabitById(db, user.id, habit.id, {})
        return ok(response)
      },
      {
        body: t.Object({
          name: t.String({ minLength: 1, maxLength: 120 }),
          description: t.Optional(t.String({ maxLength: 2000 })),
          category: t.String({ minLength: 1, maxLength: 80 }),
          frequency: t.String(),
          goal: t.Optional(t.Nullable(t.Number({ minimum: 1 }))),
          color: t.String({ minLength: 1, maxLength: 32 }),
          emoji: t.Optional(t.String({ maxLength: 8 })),
        }),
        detail: {
          tags: ["Habits"],
          summary: "Create habit",
          description: "Create a new habit for the authenticated user.",
        },
      },
    )
    .patch(
      "/habits/:habitId",
      async (context: RouteContext) => {
        const { headers, params, body, set, accessJwt } = context
        const user = await getAuthenticatedUser({
          authorization: headers.authorization,
          set,
          accessJwt,
          db,
        })

        if (!user) {
          return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
        }

        const [existingHabit] = await db
          .select()
          .from(habits)
          .where(and(eq(habits.id, params.habitId), eq(habits.userId, user.id)))
          .limit(1)

        if (!existingHabit) {
          return fail(set, 404, "NOT_FOUND", "Habit not found.")
        }

        if (body.frequency && !isFrequencyKey(body.frequency)) {
          return fail(set, 400, "INVALID_FREQUENCY", "Unsupported frequency.")
        }

        const patch: Partial<typeof existingHabit> = {
          updatedAt: new Date(),
        }

        if (body.name !== undefined) patch.name = body.name.trim()
        if (body.description !== undefined) patch.description = normalizeOptionalString(body.description)
        if (body.category !== undefined) patch.category = body.category.trim() || "OTHER"
        if (body.frequency !== undefined) patch.frequency = body.frequency
        if (body.goal !== undefined) patch.goal = body.goal
        if (body.color !== undefined) patch.color = body.color.trim()
        if (body.emoji !== undefined) patch.emoji = normalizeOptionalString(body.emoji) ?? "✨"

        await db.update(habits).set(patch).where(eq(habits.id, existingHabit.id))
        const response = await getHabitById(db, user.id, existingHabit.id, {})
        return ok(response)
      },
      {
        params: t.Object({
          habitId: t.String(),
        }),
        body: t.Object({
          name: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
          description: t.Optional(t.String({ maxLength: 2000 })),
          category: t.Optional(t.String({ minLength: 1, maxLength: 80 })),
          frequency: t.Optional(t.String()),
          goal: t.Optional(t.Nullable(t.Number({ minimum: 1 }))),
          color: t.Optional(t.String({ minLength: 1, maxLength: 32 })),
          emoji: t.Optional(t.String({ maxLength: 8 })),
        }),
        detail: {
          tags: ["Habits"],
          summary: "Update habit",
          description: "Update a habit owned by the authenticated user.",
        },
      },
    )
    .delete(
      "/habits/:habitId",
      async (context: RouteContext) => {
        const { headers, params, set, accessJwt } = context
        const user = await getAuthenticatedUser({
          authorization: headers.authorization,
          set,
          accessJwt,
          db,
        })

        if (!user) {
          return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
        }

        const [existingHabit] = await db
          .select({
            id: habits.id,
          })
          .from(habits)
          .where(and(eq(habits.id, params.habitId), eq(habits.userId, user.id)))
          .limit(1)

        if (!existingHabit) {
          return fail(set, 404, "NOT_FOUND", "Habit not found.")
        }

        await db.delete(habits).where(eq(habits.id, existingHabit.id))
        return ok({ deleted: true })
      },
      {
        params: t.Object({
          habitId: t.String(),
        }),
        detail: {
          tags: ["Habits"],
          summary: "Delete habit",
          description: "Delete a single habit and its logs.",
        },
      },
    )
    .delete(
      "/habits",
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

        await db.delete(habits).where(eq(habits.userId, user.id))
        return ok({ deleted: true })
      },
      {
        detail: {
          tags: ["Habits"],
          summary: "Delete all habits",
          description: "Delete all habits owned by the authenticated user.",
        },
      },
    )
    .post(
      "/habits/reorder",
      async (context: RouteContext) => {
        const { headers, body, set, accessJwt } = context
        const user = await getAuthenticatedUser({
          authorization: headers.authorization,
          set,
          accessJwt,
          db,
        })

        if (!user) {
          return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
        }

        const habitIds = body.items.map((item: { id: string }) => item.id)
        const ownedHabits = await db
          .select({
            id: habits.id,
          })
          .from(habits)
          .where(and(eq(habits.userId, user.id), inArray(habits.id, habitIds)))

        if (ownedHabits.length !== habitIds.length) {
          return fail(set, 400, "INVALID_HABITS", "One or more habits do not belong to the authenticated user.")
        }

        await Promise.all(
          body.items.map((item: { id: string; order: number; category: string }) =>
            db
              .update(habits)
              .set({
                order: item.order,
                category: item.category.trim() || "OTHER",
                updatedAt: new Date(),
              })
              .where(eq(habits.id, item.id)),
          ),
        )

        return ok({ updated: true })
      },
      {
        body: t.Object({
          items: t.Array(
            t.Object({
              id: t.String(),
              order: t.Number(),
              category: t.String({ minLength: 1, maxLength: 80 }),
            }),
          ),
        }),
        detail: {
          tags: ["Habits"],
          summary: "Reorder habits",
          description: "Update habit ordering and categories in bulk.",
        },
      },
    )
    .post(
      "/habits/:habitId/logs",
      async (context: RouteContext) => {
        const { headers, params, body, set, accessJwt } = context
        const user = await getAuthenticatedUser({
          authorization: headers.authorization,
          set,
          accessJwt,
          db,
        })

        if (!user) {
          return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
        }

        const [habit] = await db
          .select()
          .from(habits)
          .where(and(eq(habits.id, params.habitId), eq(habits.userId, user.id)))
          .limit(1)

        if (!habit) {
          return fail(set, 404, "NOT_FOUND", "Habit not found.")
        }

        const date = body.date ? assertIsoDate(body.date) : getTodayIsoDate()
        const count = body.count ?? 1
        const loggedAt = body.loggedAt ? new Date(body.loggedAt) : new Date()

        if (Number.isNaN(loggedAt.getTime())) {
          return fail(set, 400, "INVALID_TIMESTAMP", "loggedAt must be a valid ISO timestamp.")
        }

        const values = Array.from({ length: count }, () => ({
          id: crypto.randomUUID(),
          habitId: habit.id,
          logDate: date,
          loggedAt,
          note: normalizeOptionalString(body.note),
          createdAt: new Date(),
        }))

        await db.insert(habitLogs).values(values)
        const response = await getHabitById(db, user.id, habit.id, {
          startDate: date,
          endDate: date,
        })
        return ok(response)
      },
      {
        params: t.Object({
          habitId: t.String(),
        }),
        body: t.Object({
          date: t.Optional(t.String()),
          count: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
          loggedAt: t.Optional(t.String()),
          note: t.Optional(t.String({ maxLength: 500 })),
        }),
        detail: {
          tags: ["Habit Logs"],
          summary: "Create habit log entries",
          description: "Create one or more completion log entries for a habit.",
        },
      },
    )
    .put(
      "/habits/:habitId/day-status",
      async (context: RouteContext) => {
        const { headers, params, body, set, accessJwt } = context
        const user = await getAuthenticatedUser({
          authorization: headers.authorization,
          set,
          accessJwt,
          db,
        })

        if (!user) {
          return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
        }

        const [habit] = await db
          .select()
          .from(habits)
          .where(and(eq(habits.id, params.habitId), eq(habits.userId, user.id)))
          .limit(1)

        if (!habit) {
          return fail(set, 404, "NOT_FOUND", "Habit not found.")
        }

        const date = assertIsoDate(body.date)
        const existingLogs = await db
          .select()
          .from(habitLogs)
          .where(and(eq(habitLogs.habitId, habit.id), eq(habitLogs.logDate, date)))
          .orderBy(desc(habitLogs.createdAt))

        if (body.completed) {
          if (!existingLogs.length) {
            await db.insert(habitLogs).values({
              id: crypto.randomUUID(),
              habitId: habit.id,
              logDate: date,
              loggedAt: new Date(),
              note: null,
              createdAt: new Date(),
            })
          }
        } else if (existingLogs.length) {
          await db.delete(habitLogs).where(
            and(eq(habitLogs.habitId, habit.id), eq(habitLogs.logDate, date)),
          )
        }

        const response = await getHabitById(db, user.id, habit.id, {
          startDate: date,
          endDate: date,
        })
        return ok(response)
      },
      {
        params: t.Object({
          habitId: t.String(),
        }),
        body: t.Object({
          date: t.String(),
          completed: t.Boolean(),
        }),
        detail: {
          tags: ["Habit Logs"],
          summary: "Set single-day status",
          description: "Compatibility endpoint for calendar toggles that should behave like a checked or unchecked day.",
        },
      },
    )
    .delete(
      "/habits/:habitId/logs/:logId",
      async (context: RouteContext) => {
        const { headers, params, set, accessJwt } = context
        const user = await getAuthenticatedUser({
          authorization: headers.authorization,
          set,
          accessJwt,
          db,
        })

        if (!user) {
          return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
        }

        const [habit] = await db
          .select()
          .from(habits)
          .where(and(eq(habits.id, params.habitId), eq(habits.userId, user.id)))
          .limit(1)

        if (!habit) {
          return fail(set, 404, "NOT_FOUND", "Habit not found.")
        }

        const [log] = await db
          .select()
          .from(habitLogs)
          .where(and(eq(habitLogs.id, params.logId), eq(habitLogs.habitId, habit.id)))
          .limit(1)

        if (!log) {
          return fail(set, 404, "NOT_FOUND", "Habit log not found.")
        }

        await db.delete(habitLogs).where(eq(habitLogs.id, log.id))
        return ok({ deleted: true })
      },
      {
        params: t.Object({
          habitId: t.String(),
          logId: t.String(),
        }),
        detail: {
          tags: ["Habit Logs"],
          summary: "Delete habit log",
          description: "Delete a single log entry for a habit.",
        },
      },
    )
    .get(
      "/data/export",
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

        const userHabits = await db
          .select()
          .from(habits)
          .where(eq(habits.userId, user.id))
          .orderBy(asc(habits.order), desc(habits.createdAt))

        const logs = userHabits.length
          ? await db
              .select()
              .from(habitLogs)
              .where(inArray(habitLogs.habitId, userHabits.map((habit) => habit.id)))
              .orderBy(asc(habitLogs.logDate), asc(habitLogs.loggedAt))
          : []

        return ok({
          version: 1,
          exportedAt: new Date().toISOString(),
          habits: userHabits.map((habit) => ({
            id: habit.id,
            name: habit.name,
            description: habit.description ?? null,
            category: habit.category,
            frequency: habit.frequency,
            goal: habit.goal,
            color: habit.color,
            emoji: habit.emoji ?? "✨",
            order: habit.order,
            createdAt: habit.createdAt.toISOString(),
            updatedAt: habit.updatedAt.toISOString(),
          })),
          logs: logs.map((log) => ({
            id: log.id,
            habitId: log.habitId,
            logDate: log.logDate,
            loggedAt: log.loggedAt.toISOString(),
            note: log.note ?? null,
            createdAt: log.createdAt.toISOString(),
          })),
        })
      },
      {
        detail: {
          tags: ["Data"],
          summary: "Export user data",
          description: "Export the authenticated user's habits and logs as a JSON snapshot.",
        },
      },
    )
    .post(
      "/data/import",
      async (context: RouteContext) => {
        const { headers, body, set, accessJwt } = context
        const user = await getAuthenticatedUser({
          authorization: headers.authorization,
          set,
          accessJwt,
          db,
        })

        if (!user) {
          return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
        }

        const importedFrequencies = new Set<string>(body.habits.map((habit: { frequency: string }) => habit.frequency))
        for (const frequency of importedFrequencies) {
          if (!isFrequencyKey(frequency)) {
            return fail(set, 400, "INVALID_FREQUENCY", `Unsupported imported frequency: ${frequency}`)
          }
        }

        const mode = body.mode ?? "replace"
        if (mode === "replace") {
          await db.delete(habits).where(eq(habits.userId, user.id))
        }

        const now = new Date()
        await db.insert(habits).values(
          body.habits.map((habit: any) => ({
            id: habit.id,
            userId: user.id,
            name: habit.name.trim(),
            description: normalizeOptionalString(habit.description),
            category: habit.category.trim() || "OTHER",
            frequency: habit.frequency,
            goal: habit.goal ?? null,
            color: habit.color.trim(),
            emoji: normalizeOptionalString(habit.emoji) ?? "✨",
            order: habit.order,
            createdAt: new Date(habit.createdAt),
            updatedAt: new Date(habit.updatedAt),
          })),
        )

        if (body.logs.length) {
          await db.insert(habitLogs).values(
            body.logs.map((log: any) => ({
              id: log.id,
              habitId: log.habitId,
              logDate: assertIsoDate(log.logDate),
              loggedAt: new Date(log.loggedAt),
              note: normalizeOptionalString(log.note),
              createdAt: new Date(log.createdAt || now.toISOString()),
            })),
          )
        }

        return ok({
          importedHabits: body.habits.length,
          importedLogs: body.logs.length,
        })
      },
      {
        body: t.Object({
          version: t.Optional(t.Number()),
          mode: t.Optional(t.Union([t.Literal("replace"), t.Literal("append")])),
          habits: t.Array(
            t.Object({
              id: t.String(),
              name: t.String({ minLength: 1 }),
              description: t.Optional(t.Nullable(t.String())),
              category: t.String({ minLength: 1 }),
              frequency: t.String(),
              goal: t.Optional(t.Nullable(t.Number({ minimum: 1 }))),
              color: t.String({ minLength: 1 }),
              emoji: t.Optional(t.Nullable(t.String())),
              order: t.Number(),
              createdAt: t.String(),
              updatedAt: t.String(),
            }),
          ),
          logs: t.Array(
            t.Object({
              id: t.String(),
              habitId: t.String(),
              logDate: t.String(),
              loggedAt: t.String(),
              note: t.Optional(t.Nullable(t.String())),
              createdAt: t.Optional(t.String()),
            }),
          ),
        }),
        detail: {
          tags: ["Data"],
          summary: "Import user data",
          description: "Import a JSON snapshot of habits and logs for the authenticated user.",
        },
      },
    )
}
