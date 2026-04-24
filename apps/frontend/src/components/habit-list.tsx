import type { HabitWithLogs} from "@/lib/types"
import { useDateContext } from "@/providers/date-provider"
import { formatDate, getDaysInMonth } from "@/lib/date-utils"
import { Button } from "@/components/ui/button"
import { Check } from "lucide-react"
import { HabitForm } from "./habit-form"
import { HabitActions } from "./habit-actions"
import { DndContext, DragEndEvent, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useHabitActions } from "@/lib/use-habit-actions"
import { HabitDetailsDrawer } from "./habit-details-drawer"
import { useState } from "react"
import { MobileHabitCard } from "./mobile-habit-card"

interface HabitListProps {
  habits: HabitWithLogs[],
  title: string,
  onHabitChange: () => Promise<void>
}

export function SortableHabitRow({ 
  habit, 
  daysInMonth,
  onToggleLog,
  onEditHabit,
  onDeleteHabit,
  isToday,
  interactionSize = "compact",
}: { 
  habit: HabitWithLogs
  daysInMonth: Date[]
  onToggleLog: (habitId: string, date: Date) => void
  onEditHabit: (habit: HabitWithLogs) => void
  onDeleteHabit: (habitId: string) => void
  isToday: (date: Date) => boolean
  interactionSize?: "compact" | "full"
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: habit.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const isGoalMet = habit.goal !== null && habit.goal > 0 && habit.achieved >= habit.goal
  const rowClassName = `${isDragging ? 'bg-accent' : ''} ${isGoalMet ? 'bg-green-50 hover:bg-green-100' : ''}`
  const stickyCellClassName = `sticky left-0 shadow-[4px_0_4px_-4px_rgba(0,0,0,0.1)] z-20 ${rowClassName}`

  return (
    <>
      <tr 
        ref={setNodeRef} 
        style={style}
        className={`border-t ${rowClassName}`}
        {...attributes}
      >
        <td className={`p-2 ${stickyCellClassName} bg-white`}>
          <div className="flex items-center gap-2 min-w-0">
            <button 
              className="cursor-grab shrink-0 rounded p-1 hover:bg-accent" 
              {...listeners}
            >
              <div className="h-4 w-4">{habit.emoji || '✨'}</div>
            </button>
            <button
              type="button"
              className="min-w-0 rounded-md px-2 py-1 text-left transition-colors hover:bg-accent/60 focus-visible:bg-accent/60"
              onClick={() => setDrawerOpen(true)}
            >
              <div className="truncate font-medium">{habit.name}</div>
              <div className="truncate text-sm text-gray-500">
                {habit.achieved}{habit.goal ? `/${habit.goal}` : ""} {habit.goal ? "done" : "check-ins"}
              </div>
            </button>
          </div>
        </td>
        {daysInMonth.map((day) => {
          const date = formatDate(day)
          const log = habit.logs.find((log) => log.date === date)
          return (
            <td 
              key={day.getTime()}
              className={`relative text-center p-1 border border-slate-200/80 bg-white/60 ${isToday(day) ? 'bg-muted/70' : ''}`}
            >
              <Button
                variant="ghost"
                size="icon"
                className={`relative z-10 transition-colors ${
                  interactionSize === "full"
                    ? "flex h-10 w-full min-w-10 rounded-md border px-0"
                    : "h-8 w-8 rounded-md border"
                } ${
                  log?.completed
                    ? "border-transparent text-white"
                    : "border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:bg-slate-50"
                } ${isToday(day) ? "ring-2 ring-slate-300 ring-offset-1 ring-offset-white" : ""}`}
                style={{
                  backgroundColor: log?.completed 
                    ? `${habit.color}` 
                    : 'transparent',
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  onToggleLog(habit.id, day)
                }}
                aria-label={`${habit.name} on ${formatDate(day)} ${log?.completed ? "completed" : "not completed"}`}
              >
                {log?.completed && <Check className="h-4 w-4 text-foreground" />}
              </Button>
            </td>
          )
        })}
        <td className={`text-center p-2 sticky right-0 shadow-[-4px_0_4px_-4px_rgba(0,0,0,0.1)] z-20 ${rowClassName} bg-white`}>
          <HabitActions
            habit={habit}
            onEdit={onEditHabit}
            onDelete={onDeleteHabit}
          />
        </td>
      </tr>
      <HabitDetailsDrawer
        habit={habit}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </>
  )
}

export function HabitList({ habits: initialHabits, title, onHabitChange }: HabitListProps) {
  const { currentDate } = useDateContext()
  const {
    habits,
    editingHabit,
    setEditingHabit,
    handleToggleLog,
    handleEditHabit,
    handleDeleteHabit,
    handleReorder
  } = useHabitActions(initialHabits)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const daysInMonth = getDaysInMonth(year, month)

  const isToday = (date: Date) => {
    const today = new Date()
    return date.getDate() === today.getDate() &&
           date.getMonth() === today.getMonth() &&
           date.getFullYear() === today.getFullYear()
  }

  const handleColumnSelect = async (day: Date) => {
    const date = formatDate(day)
    const shouldComplete = habits.filter((habit) => habit.logs.some((log) => log.date === date && log.completed)).length <= habits.length / 2

    for (const habit of habits) {
      const isComplete = habit.logs.some((log) => log.date === date && log.completed)
      if (isComplete !== shouldComplete) {
        await handleToggleLog(habit.id, day)
      }
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 180,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (active.id !== over?.id) {
      const oldIndex = habits.findIndex((item) => item.id === active.id)
      const newIndex = habits.findIndex((item) => item.id === over?.id)

      // Create a deep copy of the habits array to preserve all properties
      const newHabits = [...habits]
      const [removed] = newHabits.splice(oldIndex, 1)
      newHabits.splice(newIndex, 0, removed)

      // Update the order through the hook
      handleReorder(newHabits)
    }
  }

  if (editingHabit) {
    return <HabitForm 
      habit={editingHabit} 
      onCancel={() => setEditingHabit(null)} 
      onSuccess={onHabitChange}
    />
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold capitalize">{title} ({habits.length})</h2>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="space-y-3 md:hidden">
          <SortableContext
            items={habits.map((habit) => habit.id)}
            strategy={verticalListSortingStrategy}
          >
            {habits.map((habit) => (
              <MobileHabitCard
                key={habit.id}
                habit={habit}
                days={daysInMonth}
                onToggleLog={handleToggleLog}
                onEditHabit={handleEditHabit}
                onDeleteHabit={handleDeleteHabit}
                isToday={isToday}
              />
            ))}
          </SortableContext>
        </div>

        <div className="relative hidden overflow-x-auto md:block [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-white">
                <th className="sticky left-0 z-20 min-w-[150px] bg-white p-2 text-left shadow-[4px_0_4px_-4px_rgba(0,0,0,0.1)]">Rituals</th>
                {daysInMonth.map((day) => (
                  <th 
                    key={day.getTime()}
                    className={`w-10 bg-white p-2 text-center ${
                      isToday(day) ? 'bg-muted' : ''
                    }`}
                  >
                    <div className="flex flex-col items-center">
                      <span className="text-xs text-gray-500">
                        {day.toLocaleDateString("en-US", { weekday: "short" }).charAt(0)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 hover:bg-accent"
                        onClick={() => handleColumnSelect(day)}
                      >
                        {day.getDate()}
                      </Button>
                    </div>
                  </th>
                ))}
                <th className="sticky right-0 z-20 min-w-[100px] bg-white p-2 text-center shadow-[-4px_0_4px_-4px_rgba(0,0,0,0.1)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              <SortableContext
                items={habits.map(habit => habit.id)}
                strategy={verticalListSortingStrategy}
              >
                {habits.map((habit) => (
                  <SortableHabitRow
                    key={habit.id}
                    habit={habit}
                    daysInMonth={daysInMonth}
                    onToggleLog={handleToggleLog}
                    onEditHabit={handleEditHabit}
                    onDeleteHabit={handleDeleteHabit}
                    isToday={isToday}
                  />
                ))}
              </SortableContext>
            </tbody>
          </table>
        </div>
      </DndContext>
    </div>
  )
}
