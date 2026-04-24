export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function pad(value: number) {
  return value.toString().padStart(2, "0")
}

export function formatLocalIsoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function getTodayIsoDate(now = new Date()) {
  return formatLocalIsoDate(now)
}

export function assertIsoDate(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new Error("Date must be in YYYY-MM-DD format")
  }

  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date")
  }

  return value
}

export function parseIsoDateUtc(value: string) {
  assertIsoDate(value)
  return new Date(`${value}T00:00:00.000Z`)
}

export function formatIsoDateUtc(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function addUtcDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

export function addUtcMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setUTCMonth(next.getUTCMonth() + months)
  return next
}

export function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

export function endOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
}

export function startOfUtcWeek(date: Date) {
  const day = date.getUTCDay()
  const diff = (day + 6) % 7
  return addUtcDays(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())), -diff)
}

export function endOfUtcWeek(date: Date) {
  return addUtcDays(startOfUtcWeek(date), 6)
}
