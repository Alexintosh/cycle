import {
  addUtcDays,
  addUtcMonths,
  endOfUtcMonth,
  endOfUtcWeek,
  startOfUtcMonth,
  startOfUtcWeek,
} from "./date.ts"

export type FrequencyDefinition = {
  key: string
  label: string
  getPeriodBounds(anchor: Date): {
    start: Date
    end: Date
  }
}

function createFrequency(
  key: string,
  label: string,
  getPeriodBounds: FrequencyDefinition["getPeriodBounds"],
): FrequencyDefinition {
  return {
    key,
    label,
    getPeriodBounds,
  }
}

export const frequencyRegistry = {
  daily: createFrequency("daily", "Daily", (anchor) => ({
    start: new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate())),
    end: new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate())),
  })),
  weekly: createFrequency("weekly", "Weekly", (anchor) => ({
    start: startOfUtcWeek(anchor),
    end: endOfUtcWeek(anchor),
  })),
  monthly: createFrequency("monthly", "Monthly", (anchor) => ({
    start: startOfUtcMonth(anchor),
    end: endOfUtcMonth(anchor),
  })),
  quarterly: createFrequency("quarterly", "Quarterly", (anchor) => {
    const quarterStartMonth = Math.floor(anchor.getUTCMonth() / 3) * 3
    const start = new Date(Date.UTC(anchor.getUTCFullYear(), quarterStartMonth, 1))
    const end = addUtcDays(addUtcMonths(start, 3), -1)
    return { start, end }
  }),
  semiannual: createFrequency("semiannual", "Semiannual", (anchor) => {
    const startMonth = Math.floor(anchor.getUTCMonth() / 6) * 6
    const start = new Date(Date.UTC(anchor.getUTCFullYear(), startMonth, 1))
    const end = addUtcDays(addUtcMonths(start, 6), -1)
    return { start, end }
  }),
  yearly: createFrequency("yearly", "Yearly", (anchor) => ({
    start: new Date(Date.UTC(anchor.getUTCFullYear(), 0, 1)),
    end: new Date(Date.UTC(anchor.getUTCFullYear(), 11, 31)),
  })),
} as const

export type FrequencyKey = keyof typeof frequencyRegistry

export const frequencyKeys = Object.keys(frequencyRegistry) as FrequencyKey[]

export function isFrequencyKey(value: string): value is FrequencyKey {
  return value in frequencyRegistry
}

export function getFrequencyDefinition(value: string) {
  if (!isFrequencyKey(value)) {
    throw new Error(`Unsupported frequency: ${value}`)
  }

  return frequencyRegistry[value]
}

export function listFrequencyDefinitions() {
  return frequencyKeys.map((key) => ({
    key,
    label: frequencyRegistry[key].label,
  }))
}
