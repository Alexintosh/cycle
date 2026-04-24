import { endOfMonth, startOfMonth } from "date-fns"
import { HabitList } from "@/components/habit-list"
import { HabitListActions } from "@/components/habit-list-actions"
import { ProgressSummary } from "@/components/progress-summary"
import { CalendarHeader } from "@/components/ui/calendar-header"
import { EmptyState, ErrorState, LoadingState } from "@/components/page-state"
import { useAuth } from "@/features/auth/auth-context"
import { useHabitsQuery } from "@/hooks/use-habits-query"
import { useDateContext } from "@/providers/date-provider"

export function RecapPage() {
  const { api } = useAuth()
  const { currentDate } = useDateContext()
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)

  const { habits, isLoading, error, refetch } = useHabitsQuery(
    () =>
      api.listHabits({
        startDate: monthStart.toISOString().slice(0, 10),
        endDate: monthEnd.toISOString().slice(0, 10),
        includeLogs: true,
      }),
    [api, currentDate.getFullYear(), currentDate.getMonth()],
  )

  const groupedCategories = [...new Set(habits.map((habit) => habit.category))].sort()

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-sky-700">Recap</p>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950">Cycle monthly cockpit</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Recurring life, organized by timeframe. Scan your rituals and upkeep, see goal-based progress at a glance, and manage the full month from one view.
          </p>
        </div>
      </div>

      {isLoading ? (
        <LoadingState message="Loading your monthly recap..." />
      ) : error ? (
        <ErrorState message={error} />
      ) : (
        <div className="space-y-8">
          <ProgressSummary habits={habits} />
          <section className="rounded-[1.75rem] border bg-white/85 p-6 shadow-soft backdrop-blur">
            <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <CalendarHeader />
              <HabitListActions onHabitChange={refetch} />
            </div>
            {groupedCategories.length === 0 ? (
              <EmptyState title="No rituals yet" message="Create your first ritual or upkeep item to start shaping this month." />
            ) : (
              <div className="space-y-10">
                {groupedCategories.map((category) => (
                  <HabitList
                    key={category}
                    habits={habits.filter((habit) => habit.category === category)}
                    title={category}
                    onHabitChange={refetch}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
