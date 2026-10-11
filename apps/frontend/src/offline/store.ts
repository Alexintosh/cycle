import { openDB, type DBSchema } from "idb"
import { endOfDay, endOfMonth, endOfQuarter, endOfWeek, endOfYear, format, parseISO, startOfDay, startOfMonth, startOfQuarter, startOfWeek, startOfYear } from "date-fns"
import type { BackendHabit } from "@/api/client"

export type CheckIn = { id: string; habitId: string; kind: "set-day" | "add-log"; date: string; loggedAt: string; completed?: boolean; count?: number }
export type OfflineState = { userId: string; habits: BackendHabit[] | null; reads: Record<string, unknown>; pending: CheckIn[]; savedAt?: string }
interface OfflineDB extends DBSchema { accounts: { key: string; value: OfflineState } }
const database = () => openDB<OfflineDB>("cycle-offline", 1, { upgrade(db) { db.createObjectStore("accounts", { keyPath: "userId" }) } })
const fresh = (userId: string): OfflineState => ({ userId, habits: null, reads: {}, pending: [] })
export const offlineChanged = () => window.dispatchEvent(new Event("cycle:offline-state"))
export async function readOffline(userId: string) {
  const db = await database()
  try { return await db.get("accounts", userId) ?? fresh(userId) } finally { db.close() }
}
async function update(userId: string, apply: (state: OfflineState) => void) {
  const db = await database(), tx = db.transaction("accounts", "readwrite")
  try {
    const state = await tx.store.get(userId) ?? fresh(userId)
    apply(state)
    await tx.store.put(state); await tx.done; offlineChanged()
    return state
  } finally { db.close() }
}
export const cacheRead = (userId: string, path: string, data: unknown) => update(userId, state => { state.reads[path] = data })
export const cacheHabits = (userId: string, habits: BackendHabit[]) => update(userId, state => { state.habits = habits; state.savedAt = new Date().toISOString() })
export const enqueueCheckIn = (userId: string, command: CheckIn) => update(userId, state => {
  if (!state.habits?.some(habit => habit.id === command.habitId)) throw new Error("Connect once to load this ritual before using it offline.")
  state.pending.push(command)
})
export const acknowledgeCheckIn = (userId: string, id: string) => update(userId, state => {
  const command = state.pending.find(command => command.id === id)
  // Preserve the confirmed result even if fetching the new snapshot fails.
  if (command && state.habits) state.habits = applyPending(state.habits, [command])
  state.pending = state.pending.filter(command => command.id !== id)
})
export const discardCheckIns = (userId: string) => update(userId, state => { state.pending = [] })
export const clearOfflineReads = (userId: string) => update(userId, state => { state.habits = null; state.reads = {}; delete state.savedAt })

export function applyPending(habits: BackendHabit[], pending: CheckIn[]): BackendHabit[] {
  const result = structuredClone(habits)
  for (const command of pending) {
    const habit = result.find(habit => habit.id === command.habitId)
    if (!habit) continue
    if (command.kind === "set-day" && !command.completed) habit.logs = habit.logs.filter(log => log.logDate !== command.date)
    else if (command.kind === "add-log" || !habit.logs.some(log => log.logDate === command.date)) {
      for (let index = 0; index < (command.kind === "add-log" ? command.count ?? 1 : 1); index++) {
        const id = `${command.id}-${index}`
        if (!habit.logs.some(log => log.id === id)) habit.logs.push({ id, habitId: habit.id, logDate: command.date, loggedAt: command.loggedAt, note: null })
      }
    }
  }
  return result
}
function period(frequency: BackendHabit["frequency"], anchor: string) {
  const date = parseISO(anchor)
  let start: Date, end: Date
  switch (frequency) {
    case "weekly": start = startOfWeek(date, { weekStartsOn: 1 }); end = endOfWeek(date, { weekStartsOn: 1 }); break
    case "monthly": start = startOfMonth(date); end = endOfMonth(date); break
    case "quarterly": start = startOfQuarter(date); end = endOfQuarter(date); break
    case "semiannual": { const month = date.getMonth() < 6 ? 0 : 6; start = new Date(date.getFullYear(), month, 1); end = new Date(date.getFullYear(), month + 6, 0); break }
    case "yearly": start = startOfYear(date); end = endOfYear(date); break
    default: start = startOfDay(date); end = endOfDay(date)
  }
  return { start: format(start, "yyyy-MM-dd"), end: format(end, "yyyy-MM-dd") }
}
export function projectHabits(state: OfflineState, params: Record<string, string | boolean | undefined> = {}) {
  if (!state.habits) return undefined
  const start = typeof params.startDate === "string" ? params.startDate : null
  const end = typeof params.endDate === "string" ? params.endDate : null
  return applyPending(state.habits, state.pending)
    .filter(habit => (!params.frequency || habit.frequency === params.frequency) && (!params.category || habit.category === params.category))
    .map(habit => {
      const logs = params.includeLogs === true || params.includeLogs === "true" ? habit.logs.filter(log => (!start || log.logDate >= start) && (!end || log.logDate <= end)) : []
      return { ...habit, logs, achieved: logs.length, stats: { ...habit.stats, rangeStart: start, rangeEnd: end, logCount: logs.length, uniqueLoggedDays: new Set(logs.map(log => log.logDate)).size, isGoalMet: habit.goal === null ? null : logs.length >= habit.goal, suggestedFrequencyPeriod: period(habit.frequency, end ?? start ?? format(new Date(), "yyyy-MM-dd")) } }
    })
}
export async function cachedResponse(userId: string, path: string) {
  const state = await readOffline(userId)
  const url = new URL(path, "https://cycle.local")
  if (url.pathname === "/habits") return projectHabits(state, Object.fromEntries(url.searchParams))
  if (url.pathname === "/habits/completed-non-daily") {
    const date = url.searchParams.get("date") ?? format(new Date(), "yyyy-MM-dd")
    return projectHabits(state, { startDate: date, endDate: date, includeLogs: true })?.filter(habit => habit.frequency !== "daily" && habit.logs.length > 0)
  }
  return state.reads[path]
}
