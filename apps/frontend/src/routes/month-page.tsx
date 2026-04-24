import { useEffect, useState } from "react"
import { useAuth } from "@/features/auth/auth-context"
import type { HabitWithLogs } from "@/lib/types"

function toLocalIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

function monthBounds(date: Date) {
  return {
    startDate: toLocalIsoDate(new Date(date.getFullYear(), date.getMonth(), 1)),
    endDate: toLocalIsoDate(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
  }
}

export function MonthPage() {
  const { api } = useAuth()
  const [cursor, setCursor] = useState(() => new Date())
  const [habits, setHabits] = useState<HabitWithLogs[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async (date: Date) => {
    setIsLoading(true)
    setError(null)
    try {
      const { startDate, endDate } = monthBounds(date)
      const data = await api.listHabits({
        frequency: "monthly",
        startDate,
        endDate,
        includeLogs: true,
      })
      setHabits(data.sort((a, b) => a.order - b.order))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load monthly rituals.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load(cursor)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor])

  const handleToggleToday = async (habit: HabitWithLogs) => {
    const todayIso = toLocalIsoDate(new Date())
    const isCompleted = habit.logs.some((log) => log.date === todayIso && log.completed)
    await api.setDayStatus(habit.id, todayIso, !isCompleted)
    await load(cursor)
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Monthly rituals</h1>
          <p className="mt-1 text-sm text-slate-600">{cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
            type="button"
          >
            Previous
          </button>
          <button
            className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
            type="button"
          >
            Next
          </button>
        </div>
      </div>

      {isLoading ? <p className="text-slate-600">Loading monthly rituals...</p> : null}
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {!isLoading && !error ? (
        <section className="rounded-2xl border bg-white/70 p-4 shadow-sm">
          {habits.length ? (
            <ul className="space-y-2">
              {habits.map((habit) => {
                const todayIso = toLocalIsoDate(new Date())
                const doneToday = habit.logs.some((log) => log.date === todayIso && log.completed)
                return (
                  <li key={habit.id} className="flex items-center justify-between rounded-xl border bg-white/80 p-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{habit.emoji || "✨"}</span>
                      <div>
                        <p className="font-medium text-slate-900">{habit.name}</p>
                          <p className="text-xs text-slate-500">
                            {habit.goal ? `${habit.achieved}/${habit.goal}` : `${habit.achieved} check-ins this month`}
                          </p>
                      </div>
                    </div>
                    <button
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                        doneToday
                          ? "bg-emerald-500 text-white hover:bg-emerald-600"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                      onClick={() => void handleToggleToday(habit)}
                      type="button"
                    >
                      {doneToday ? "Done Today" : "Mark Today"}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No monthly rituals found for this month.</p>
          )}
        </section>
      ) : null}
    </main>
  )
}
