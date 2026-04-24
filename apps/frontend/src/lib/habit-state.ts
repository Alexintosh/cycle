import type { HabitLog, HabitWithLogs } from "@/lib/types"

function isTemporaryLog(log: HabitLog) {
  return log.id.startsWith("temp-")
}

function mergeUniqueLogs(existing: HabitLog[], incoming: HabitLog[]) {
  const map = new Map<string, HabitLog>()
  for (const log of existing) {
    map.set(log.id, log)
  }
  for (const log of incoming) {
    map.set(log.id, log)
  }
  return [...map.values()].sort((left, right) => {
    const dateCompare = left.date.localeCompare(right.date)
    if (dateCompare !== 0) {
      return dateCompare
    }
    return (left.loggedAt ?? "").localeCompare(right.loggedAt ?? "")
  })
}

export function reconcileHabitAfterDayStatus(
  previousHabit: HabitWithLogs,
  nextHabit: HabitWithLogs,
  date: string,
  completed: boolean,
): HabitWithLogs {
  const incomingDates = new Set(nextHabit.logs.map((log) => log.date))
  const sanitizedPreviousLogs = previousHabit.logs.filter((log) => {
    if (!isTemporaryLog(log)) {
      return true
    }

    return !incomingDates.has(log.date)
  })

  const logs = completed
    ? mergeUniqueLogs(sanitizedPreviousLogs, nextHabit.logs)
    : previousHabit.logs.filter((log) => log.date !== date && !isTemporaryLog(log))

  const achieved = logs.length
  const uniqueLoggedDays = new Set(logs.map((log) => log.date)).size

  return {
    ...previousHabit,
    ...nextHabit,
    logs,
    achieved,
    stats: {
      ...previousHabit.stats,
      ...nextHabit.stats,
      logCount: achieved,
      uniqueLoggedDays,
      isGoalMet: nextHabit.goal === null ? null : achieved >= nextHabit.goal,
    },
  }
}
