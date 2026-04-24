import { useEffect, useState } from "react"
import { useAuth } from "@/features/auth/auth-context"
import type { HabitWithLogs } from "@/lib/types"

function toLocalIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

function startOfMonthIso(date: Date) {
  return toLocalIsoDate(new Date(date.getFullYear(), date.getMonth(), 1))
}

function endOfMonthIso(date: Date) {
  return toLocalIsoDate(new Date(date.getFullYear(), date.getMonth() + 1, 0))
}

function HabitRow({
  habit,
  currentDate,
  onToggle,
}: {
  habit: HabitWithLogs
  currentDate: string
  onToggle: (habit: HabitWithLogs) => Promise<void>
}) {
  const isCompleted = habit.logs.some((log) => log.date === currentDate && log.completed)
  const label = habit.goal ? `${habit.achieved}/${habit.goal}` : `${habit.achieved} check-ins`

  return (
    <li className="flex items-center justify-between rounded-xl border bg-white/80 p-3">
      <div className="flex items-center gap-3">
        <span className="text-xl">{habit.emoji || "✨"}</span>
        <div>
          <p className="font-medium text-slate-900">{habit.name}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </div>
      <button
        className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
          isCompleted
            ? "bg-emerald-500 text-white hover:bg-emerald-600"
            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
        }`}
        onClick={() => void onToggle(habit)}
        type="button"
      >
        {isCompleted ? "Done" : "Mark"}
      </button>
    </li>
  )
}

export function DayPage() {
  const { api } = useAuth()
  const [dailyHabits, setDailyHabits] = useState<HabitWithLogs[]>([])
  const [completedNonDailyHabits, setCompletedNonDailyHabits] = useState<HabitWithLogs[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const today = new Date()
  const todayIso = toLocalIsoDate(today)

  const load = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [daily, completed] = await Promise.all([
        api.listHabits({
          frequency: "daily",
          startDate: startOfMonthIso(today),
          endDate: endOfMonthIso(today),
          includeLogs: true,
        }),
        api.getCompletedNonDaily(todayIso),
      ])

      setDailyHabits(daily.sort((a, b) => a.order - b.order))
      setCompletedNonDailyHabits(completed.sort((a, b) => a.order - b.order))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load today's rituals.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleToggle = async (habit: HabitWithLogs) => {
    const isCompleted = habit.logs.some((log) => log.date === todayIso && log.completed)
    await api.setDayStatus(habit.id, todayIso, !isCompleted)
    await load()
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Today in Cycle</h1>
        <p className="mt-1 text-sm text-slate-600">Today: {today.toLocaleDateString()}</p>
      </div>

      {isLoading ? <p className="text-slate-600">Loading rituals...</p> : null}
      {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {!isLoading && !error ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border bg-white/70 p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Daily Rituals</h2>
            {dailyHabits.length ? (
              <ul className="space-y-2">
                {dailyHabits.map((habit) => (
                  <HabitRow key={habit.id} habit={habit} currentDate={todayIso} onToggle={handleToggle} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No daily rituals yet.</p>
            )}
          </section>

          <section className="rounded-2xl border bg-white/70 p-4 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Upkeep and Non-Daily Wins Today</h2>
            {completedNonDailyHabits.length ? (
              <ul className="space-y-2">
                {completedNonDailyHabits.map((habit) => (
                  <HabitRow key={habit.id} habit={habit} currentDate={todayIso} onToggle={handleToggle} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No upkeep or non-daily completions yet.</p>
            )}
          </section>
        </div>
      ) : null}
    </main>
  )
}
