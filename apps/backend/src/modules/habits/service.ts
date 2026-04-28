import { and, asc, desc, eq, inArray, lte, gte } from "drizzle-orm"
import type { AppDatabase } from "../../db/client.ts"
import { habitLogs, habits, type HabitLogRecord, type HabitRecord } from "../../db/schema.ts"
import { assertIsoDate, formatIsoDateUtc, getTodayIsoDate, parseIsoDateUtc } from "../../lib/date.ts"
import { getFrequencyDefinition, isFrequencyKey } from "../../lib/frequencies.ts"

export type HabitListOptions = {
  userId: string
  startDate?: string
  endDate?: string
  includeLogs?: boolean
  category?: string
  frequency?: string
}

export function normalizeRange(startDate?: string, endDate?: string) {
  const normalizedStart = startDate ? assertIsoDate(startDate) : undefined
  const normalizedEnd = endDate ? assertIsoDate(endDate) : undefined

  if (normalizedStart && normalizedEnd && normalizedStart > normalizedEnd) {
    throw new Error("startDate must be before or equal to endDate")
  }

  return {
    startDate: normalizedStart,
    endDate: normalizedEnd,
  }
}

function mapHabit(habit: HabitRecord, logs: HabitLogRecord[], range: { startDate?: string; endDate?: string }) {
  if (!isFrequencyKey(habit.frequency)) {
    throw new Error(`Habit ${habit.id} has unsupported frequency "${habit.frequency}"`)
  }

  const anchorDate = range.endDate || range.startDate || getTodayIsoDate()
  const frequencyPeriod = getFrequencyDefinition(habit.frequency).getPeriodBounds(parseIsoDateUtc(anchorDate))
  const logCount = logs.length
  const uniqueDays = new Set(logs.map((log) => log.logDate)).size

  return {
    id: habit.id,
    name: habit.name,
    description: habit.description ?? "",
    category: habit.category,
    frequency: habit.frequency,
    goal: habit.goal,
    color: habit.color,
    emoji: habit.emoji ?? "✨",
    sourceType: habit.sourceType,
    packageId: habit.packageId,
    packageItemId: habit.packageItemId,
    order: habit.order,
    createdAt: habit.createdAt.toISOString(),
    updatedAt: habit.updatedAt.toISOString(),
    logs: logs.map((log) => ({
      id: log.id,
      habitId: log.habitId,
      logDate: log.logDate,
      loggedAt: log.loggedAt.toISOString(),
      note: log.note ?? null,
    })),
    achieved: logCount,
    stats: {
      rangeStart: range.startDate ?? null,
      rangeEnd: range.endDate ?? null,
      logCount,
      uniqueLoggedDays: uniqueDays,
      goal: habit.goal,
      isGoalMet: habit.goal === null ? null : logCount >= habit.goal,
      suggestedFrequencyPeriod: {
        start: formatIsoDateUtc(frequencyPeriod.start),
        end: formatIsoDateUtc(frequencyPeriod.end),
      },
    },
  }
}

export async function listHabits(db: AppDatabase, options: HabitListOptions) {
  const range = normalizeRange(options.startDate, options.endDate)

  const where = [eq(habits.userId, options.userId)]
  if (options.category) {
    where.push(eq(habits.category, options.category))
  }
  if (options.frequency) {
    where.push(eq(habits.frequency, options.frequency))
  }

  const rows = await db
    .select()
    .from(habits)
    .where(and(...where))
    .orderBy(asc(habits.order), desc(habits.createdAt))

  if (!rows.length) {
    return []
  }

  const includeLogs = options.includeLogs ?? Boolean(range.startDate || range.endDate)
  let logsByHabitId = new Map<string, HabitLogRecord[]>()

  if (includeLogs) {
    const logConditions = [inArray(habitLogs.habitId, rows.map((habit) => habit.id))]
    if (range.startDate) {
      logConditions.push(gte(habitLogs.logDate, range.startDate))
    }
    if (range.endDate) {
      logConditions.push(lte(habitLogs.logDate, range.endDate))
    }

    const logs = await db
      .select()
      .from(habitLogs)
      .where(and(...logConditions))
      .orderBy(asc(habitLogs.logDate), asc(habitLogs.loggedAt))

    logsByHabitId = logs.reduce((map, log) => {
      const current = map.get(log.habitId) ?? []
      current.push(log)
      map.set(log.habitId, current)
      return map
    }, new Map<string, HabitLogRecord[]>())
  }

  return rows.map((habit) => mapHabit(habit, logsByHabitId.get(habit.id) ?? [], range))
}

export async function getHabitById(
  db: AppDatabase,
  userId: string,
  habitId: string,
  range: { startDate?: string; endDate?: string },
) {
  const [habit] = await db
    .select()
    .from(habits)
    .where(and(eq(habits.id, habitId), eq(habits.userId, userId)))
    .limit(1)

  if (!habit) {
    return null
  }

  const logs = await listHabitLogs(db, habit.id, range)
  return mapHabit(habit, logs, normalizeRange(range.startDate, range.endDate))
}

export async function listHabitLogs(
  db: AppDatabase,
  habitId: string,
  range: { startDate?: string; endDate?: string },
) {
  const normalizedRange = normalizeRange(range.startDate, range.endDate)
  const conditions = [eq(habitLogs.habitId, habitId)]

  if (normalizedRange.startDate) {
    conditions.push(gte(habitLogs.logDate, normalizedRange.startDate))
  }
  if (normalizedRange.endDate) {
    conditions.push(lte(habitLogs.logDate, normalizedRange.endDate))
  }

  return db
    .select()
    .from(habitLogs)
    .where(and(...conditions))
    .orderBy(asc(habitLogs.logDate), asc(habitLogs.loggedAt))
}
