import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { HabitWithLogs } from "@/lib/types"
import { useMemo, useState } from "react"
import { HabitActions } from "./habit-actions"
import { useHabitActions } from "@/lib/use-habit-actions"
import { HabitForm } from "./habit-form"

interface TodoListViewProps {
  habits: HabitWithLogs[]
  currentDate: Date // Format: YYYY-MM-DD
}

export function TodoListView({ habits, currentDate }: TodoListViewProps) {
  const [isUpdating, setIsUpdating] = useState<string | null>(null)
  const currentDateStr = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = String(currentDate.getMonth() + 1).padStart(2, "0")
    const day = String(currentDate.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }, [currentDate])

  const hasCompletionOnDate = (habit: HabitWithLogs) =>
    habit.logs.some((log) => log.date === currentDateStr && log.completed)

  const orderedHabits = useMemo(() => {
    return [...habits].sort((left, right) => {
      const leftCompleted = hasCompletionOnDate(left)
      const rightCompleted = hasCompletionOnDate(right)

      if (leftCompleted === rightCompleted) {
        return left.order - right.order
      }

      return leftCompleted ? 1 : -1
    })
  }, [habits, currentDateStr])

  const {
    editingHabit,
    setEditingHabit,
    handleToggleLog,
    handleEditHabit,
    handleDeleteHabit,
  } = useHabitActions(habits)

  const handleCancelEdit = () => {
    setEditingHabit(null)
  }

  if (editingHabit) {
    return <HabitForm habit={editingHabit} onCancel={handleCancelEdit} />
  }

  return (
    <div className="space-y-3">
      {orderedHabits.map((habit) => (
        <Card 
          key={habit.id}
          className={`p-4 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer ${
            hasCompletionOnDate(habit)
              ? 'bg-green-50 hover:bg-green-100' 
              : ''
          }`}
          onClick={async () => {
            setIsUpdating(habit.id)
            try {
              await handleToggleLog(habit.id, currentDate)
            } finally {
              setIsUpdating(null)
            }
          }}
        >
          <div className="flex items-center space-x-3">
            <span className="text-2xl" role="img" aria-label={`Habit emoji: ${habit.name}`}>
              {habit.emoji || '✨'}
            </span>
            <div>
              <h3 className="font-medium">{habit.name} {currentDateStr}</h3>
              {habit.description && (
                <p className="text-sm text-gray-500">{habit.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-500">
              {habit.goal ? `${habit.achieved}/${habit.goal} this period` : `${habit.achieved} check-ins`}
            </div>
            <HabitActions
              habit={habit}
              onEdit={handleEditHabit}
              onDelete={handleDeleteHabit}
            />
            <Button 
              variant="ghost" 
              size="sm"
              disabled={isUpdating === habit.id}
              className={hasCompletionOnDate(habit)
                ? 'text-green-600' 
                : 'text-gray-400'
              }
              onClick={(event) => {
                event.stopPropagation()
                void handleToggleLog(habit.id, currentDate)
              }}
            >
              {isUpdating === habit.id ? (
                <span className="animate-spin">⟳</span>
              ) : hasCompletionOnDate(habit) ? (
                '✓'
              ) : (
                '○'
              )}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  )
} 
