import { describe, expect, it } from "vitest"
import type { HabitWithLogs } from "@/lib/types"
import { reconcileHabitAfterDayStatus } from "./habit-state"

function makeHabit(overrides: Partial<HabitWithLogs> = {}): HabitWithLogs {
  return {
    id: "habit-1",
    name: "Meditation",
    description: "",
    frequency: "weekly",
    category: "MORNING",
    goal: 3,
    color: "#ff0000",
    emoji: "🧘‍♀️",
    order: 0,
    createdAt: "2026-04-24T00:00:00.000Z",
    updatedAt: "2026-04-24T00:00:00.000Z",
    logs: [],
    achieved: 0,
    stats: {
      rangeStart: "2026-04-01",
      rangeEnd: "2026-04-30",
      logCount: 0,
      uniqueLoggedDays: 0,
      goal: 3,
      isGoalMet: false,
      suggestedFrequencyPeriod: {
        start: "2026-04-20",
        end: "2026-04-26",
      },
    },
    ...overrides,
  }
}

describe("reconcileHabitAfterDayStatus", () => {
  it("preserves logs from other dates when toggling a single day", () => {
    const previous = makeHabit({
      logs: [
        { id: "log-a", habitId: "habit-1", date: "2026-04-22", completed: true },
        { id: "log-b", habitId: "habit-1", date: "2026-04-23", completed: true },
      ],
      achieved: 2,
      stats: {
        rangeStart: "2026-04-01",
        rangeEnd: "2026-04-30",
        logCount: 2,
        uniqueLoggedDays: 2,
        goal: 3,
        isGoalMet: false,
        suggestedFrequencyPeriod: {
          start: "2026-04-20",
          end: "2026-04-26",
        },
      },
    })

    const next = makeHabit({
      logs: [{ id: "log-c", habitId: "habit-1", date: "2026-04-24", completed: true }],
      achieved: 1,
      stats: {
        rangeStart: "2026-04-24",
        rangeEnd: "2026-04-24",
        logCount: 1,
        uniqueLoggedDays: 1,
        goal: 3,
        isGoalMet: false,
        suggestedFrequencyPeriod: {
          start: "2026-04-20",
          end: "2026-04-26",
        },
      },
    })

    const merged = reconcileHabitAfterDayStatus(previous, next, "2026-04-24", true)
    expect(merged.logs).toHaveLength(3)
    expect(merged.logs.map((log) => log.date)).toEqual(["2026-04-22", "2026-04-23", "2026-04-24"])
    expect(merged.achieved).toBe(3)
    expect(merged.stats.logCount).toBe(3)
    expect(merged.stats.uniqueLoggedDays).toBe(3)
  })

  it("replaces optimistic temp logs with the saved server log for the same date", () => {
    const previous = makeHabit({
      logs: [
        { id: "temp-habit-1-2026-04-22", habitId: "habit-1", date: "2026-04-22", completed: true },
      ],
      achieved: 1,
      stats: {
        rangeStart: "2026-04-20",
        rangeEnd: "2026-04-26",
        logCount: 1,
        uniqueLoggedDays: 1,
        goal: 3,
        isGoalMet: false,
        suggestedFrequencyPeriod: {
          start: "2026-04-20",
          end: "2026-04-26",
        },
      },
    })

    const next = makeHabit({
      logs: [{ id: "log-real", habitId: "habit-1", date: "2026-04-22", completed: true }],
      achieved: 1,
      stats: {
        rangeStart: "2026-04-22",
        rangeEnd: "2026-04-22",
        logCount: 1,
        uniqueLoggedDays: 1,
        goal: 3,
        isGoalMet: false,
        suggestedFrequencyPeriod: {
          start: "2026-04-20",
          end: "2026-04-26",
        },
      },
    })

    const merged = reconcileHabitAfterDayStatus(previous, next, "2026-04-22", true)
    expect(merged.logs).toHaveLength(1)
    expect(merged.logs[0]?.id).toBe("log-real")
    expect(merged.achieved).toBe(1)
    expect(merged.stats.logCount).toBe(1)
  })
})
