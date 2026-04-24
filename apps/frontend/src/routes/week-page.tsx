import { endOfWeek, formatISO, startOfWeek } from "date-fns"
import { HabitListActions } from "@/components/habit-list-actions"
import { WeeklyHabitsContainer } from "@/components/weekly-habits-container"
import { PeriodNavigator } from "@/components/period-navigator"
import { EmptyState, ErrorState, LoadingState } from "@/components/page-state"
import { useAuth } from "@/features/auth/auth-context"
import { useHabitsQuery } from "@/hooks/use-habits-query"
import { useDateContext } from "@/providers/date-provider"

export function WeekPage() {
  const { api } = useAuth()
  const { currentDate, setCurrentDate } = useDateContext()
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 })

  const { habits, isLoading, error, refetch } = useHabitsQuery(
    () =>
      api.listHabits({
        frequency: "weekly",
        startDate: formatISO(weekStart, { representation: "date" }),
        endDate: formatISO(weekEnd, { representation: "date" }),
        includeLogs: true,
      }),
    [api, weekStart.getTime(), weekEnd.getTime()],
  )

  return (
    <main className="container mx-auto px-4 py-4 md:py-8">
      <div className="mb-6 flex flex-col gap-3 md:mb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-emerald-700">Weekly view</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl md:text-4xl">Plan the week, then keep it moving.</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Search, filter, and reorder weekly rituals and upkeep across categories while keeping each day visible.
          </p>
        </div>
        <HabitListActions onHabitChange={refetch} />
      </div>

      <section className="rounded-[1.5rem] border bg-white/85 p-4 shadow-soft backdrop-blur md:rounded-[1.75rem] md:p-6">
        <PeriodNavigator currentDate={currentDate} onDateChange={setCurrentDate} periodType="week" className="mb-4 justify-start" />
        {isLoading ? (
          <LoadingState message="Loading the weekly board..." />
        ) : error ? (
          <ErrorState message={error} />
        ) : habits.length === 0 ? (
          <EmptyState title="No weekly rituals yet" message="Add a weekly ritual or upkeep item to start planning this view." />
        ) : (
          <WeeklyHabitsContainer habits={habits} onHabitChange={refetch} weekStart={weekStart} />
        )}
      </section>
    </main>
  )
}
