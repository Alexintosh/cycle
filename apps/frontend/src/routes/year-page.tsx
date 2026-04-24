import { useEffect, useState } from "react"
import { useAuth } from "@/features/auth/auth-context"
import type { HabitWithLogs } from "@/lib/types"

function yearBounds(year: number) {
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  }
}

function toLocalIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function YearPage() {
  const { api } = useAuth()
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [habits, setHabits] = useState<HabitWithLogs[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [logDate, setLogDate] = useState(() => toLocalIsoDate(new Date()))

  const load = async (targetYear: number) => {
    setIsLoading(true)
    setError(null)
    try {
      const { startDate, endDate } = yearBounds(targetYear)
      const data = await api.listHabits({
        frequency: "yearly",
        startDate,
        endDate,
        includeLogs: true,
      })
      setHabits(data.sort((a, b) => a.order - b.order))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load yearly rituals.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load(year)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year])

  const handleLog = async (habit: HabitWithLogs) => {
    await api.addLog(habit.id, logDate, 1)
    await load(year)
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Yearly rituals</h1>
          <p className="mt-1 text-sm text-slate-600">Whole-year range: January 1 to December 31</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => setYear((prev) => prev - 1)}
            type="button"
          >
            Previous
          </button>
          <div className="rounded-lg border bg-white px-4 py-2 text-sm font-medium text-slate-800">{year}</div>
          <button
            className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => setYear((prev) => prev + 1)}
            type="button"
          >
            Next
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border bg-white/70 p-4 shadow-sm">
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="year-log-date">
          Add check-in on date
        </label>
        <input
          id="year-log-date"
          className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
          type="date"
          value={logDate}
          min={`${year}-01-01`}
          max={`${year}-12-31`}
          onChange={(event) => setLogDate(event.target.value)}
        />
      </div>

      {isLoading ? <p className="text-slate-600">Loading yearly rituals...</p> : null}
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {!isLoading && !error ? (
        <section className="rounded-2xl border bg-white/70 p-4 shadow-sm">
          {habits.length ? (
            <ul className="space-y-2">
              {habits.map((habit) => (
                <li key={habit.id} className="flex items-center justify-between rounded-xl border bg-white/80 p-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{habit.emoji || "✨"}</span>
                    <div>
                      <p className="font-medium text-slate-900">{habit.name}</p>
                      <p className="text-xs text-slate-500">
                        {habit.goal ? `${habit.achieved}/${habit.goal}` : `${habit.achieved} check-ins in ${year}`}
                      </p>
                    </div>
                  </div>
                  <button
                    className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                    onClick={() => void handleLog(habit)}
                    type="button"
                  >
                    Add Check-in
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No yearly rituals found for {year}.</p>
          )}
        </section>
      ) : null}
    </main>
  )
}
