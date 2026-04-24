import { useEffect, useState } from "react"
import { useAuth } from "@/features/auth/auth-context"
import { Habit, HabitLog, HabitWithLogs } from "@/lib/types"
import { reconcileHabitAfterDayStatus } from "@/lib/habit-state"

export function useHabitActions(initialHabits: HabitWithLogs[]) {
  const { api } = useAuth()
  const [habits, setHabits] = useState(initialHabits)
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null)

  useEffect(() => {
    setHabits(initialHabits)
  }, [initialHabits])

  const toLocalDate = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  const handleToggleLog = async (habitId: string, date: Date) => {
    const dateKey = toLocalDate(date)
    const previousHabits = habits
    const targetHabit = previousHabits.find((habit) => habit.id === habitId)
    const hasCompletion = targetHabit?.logs.some((log) => log.date === dateKey && log.completed) ?? false
    const nextCompleted = !hasCompletion

    setHabits((currentHabits) =>
      currentHabits.map((habit) => {
        if (habit.id !== habitId) {
          return habit
        }

        const nextLogs: HabitLog[] = hasCompletion
          ? habit.logs.filter((log) => log.date !== dateKey)
          : [
              ...habit.logs,
              {
                id: `temp-${habitId}-${dateKey}`,
                habitId,
                date: dateKey,
                completed: true,
              },
            ]

        const achievedDelta = hasCompletion ? -1 : 1

        return {
          ...habit,
          logs: nextLogs,
          achieved: Math.max(0, habit.achieved + achievedDelta),
          stats: {
            ...habit.stats,
            logCount: Math.max(0, habit.stats.logCount + achievedDelta),
          },
        }
      }),
    )

    try {
      const updatedHabit = await api.setDayStatus(habitId, dateKey, nextCompleted)
      setHabits((currentHabits) =>
        currentHabits.map((habit) =>
          habit.id === habitId ? reconcileHabitAfterDayStatus(habit, updatedHabit, dateKey, nextCompleted) : habit,
        ),
      )
    } catch (error) {
      console.error("Failed to toggle habit log:", error)
      setHabits(previousHabits)
    }
  }

  const handleEditHabit = (habit: Habit) => {
    setEditingHabit(habit)
  }

  const handleDeleteHabit = async (habitId: string) => {
    await api.deleteHabit(habitId)
    setHabits((currentHabits) => currentHabits.filter((habit) => habit.id !== habitId))
  }

  const handleReorder = async (newHabits: HabitWithLogs[]) => {
    setHabits(newHabits)
    const updates = newHabits.map((habit, index) => ({
      id: habit.id,
      order: index,
      category: habit.category,
    }))
    await api.reorderHabits(updates)
  }

  return {
    habits,
    editingHabit,
    setEditingHabit,
    handleToggleLog,
    handleEditHabit,
    handleDeleteHabit,
    handleReorder,
  }
}
