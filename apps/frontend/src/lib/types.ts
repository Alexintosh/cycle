export type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "semiannual" | "yearly"

export const HabitCategories = [
  "MORNING",
  "BREAKFAST",
  "HEALTH",
  "BUILDING",
  "OTHER",
  "ADULTING",
  "SELF IMPROVEMENT",
  "FITNESS",
  "NUTRITION",
  "BED TIME",
] as const

export interface HabitLog {
  id: string
  habitId: string
  date: string
  completed: boolean
  loggedAt?: string
  note?: string | null
}

export interface HabitStats {
  rangeStart: string | null
  rangeEnd: string | null
  logCount: number
  uniqueLoggedDays: number
  goal: number | null
  isGoalMet: boolean | null
  suggestedFrequencyPeriod: {
    start: string
    end: string
  }
}

export interface Habit {
  id: string
  name: string
  description: string
  frequency: Frequency
  category: string
  goal: number | null
  color: string
  emoji?: string
  order: number
  createdAt: string
  updatedAt: string
}

export interface HabitWithLogs extends Habit {
  logs: HabitLog[]
  achieved: number
  stats: HabitStats
}

export interface User {
  id: string
  email: string
  displayName: string
  lastLoginAt?: string | null
}

export interface SessionTokens {
  token: string
  refreshToken: string
}
