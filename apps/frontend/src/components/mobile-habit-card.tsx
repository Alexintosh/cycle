import { format } from "date-fns"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Check, GripVertical } from "lucide-react"
import type { HabitWithLogs } from "@/lib/types"
import { HabitDetailsDrawer } from "./habit-details-drawer"
import { HabitActions } from "./habit-actions"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useState } from "react"

interface MobileHabitCardProps {
  habit: HabitWithLogs
  days: Date[]
  onToggleLog: (habitId: string, date: Date) => void
  onEditHabit: (habit: HabitWithLogs) => void
  onDeleteHabit: (habitId: string) => void
  isToday: (date: Date) => boolean
}

export function MobileHabitCard({
  habit,
  days,
  onToggleLog,
  onEditHabit,
  onDeleteHabit,
  isToday,
}: MobileHabitCardProps) {
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

  return (
    <>
      <article
        ref={setNodeRef}
        style={style}
        className={cn(
          "rounded-2xl border bg-white p-4 shadow-sm",
          isDragging && "bg-accent",
        )}
        {...attributes}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="mt-0.5 shrink-0 rounded-md p-1.5 text-slate-500 hover:bg-accent"
            {...listeners}
            aria-label={`Reorder ${habit.name}`}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => setDrawerOpen(true)}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-xl leading-none">{habit.emoji || "✨"}</span>
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-slate-950">{habit.name}</div>
                <div className="truncate text-sm text-slate-500">
                  {habit.achieved}
                  {habit.goal ? `/${habit.goal}` : ""}
                  {" "}
                  {habit.goal ? "done" : "check-ins"}
                </div>
              </div>
            </div>
          </button>
          <HabitActions habit={habit} onEdit={onEditHabit} onDelete={onDeleteHabit} />
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {days.map((day) => {
            const date = format(day, "yyyy-MM-dd")
            const log = habit.logs.find((entry) => entry.date === date)
            const completed = log?.completed ?? false

            return (
              <Button
                key={day.toISOString()}
                type="button"
                variant="outline"
                className={cn(
                  "relative flex h-[4.8125rem] w-full flex-col items-center justify-center gap-1.5 rounded-xl px-0 py-2 text-center text-[11px] leading-none transition-colors touch-manipulation",
                  completed
                    ? "border-transparent text-white shadow-sm"
                    : isToday(day)
                      ? "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50",
                  isToday(day) && !completed && "ring-2 ring-slate-300 ring-offset-1 ring-offset-white",
                )}
                style={{
                  backgroundColor: completed ? habit.color : undefined,
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  onToggleLog(habit.id, day)
                }}
                aria-label={`${habit.name} on ${format(day, "EEE d")} ${completed ? "completed" : "not completed"}`}
              >
                <span className={cn("font-medium uppercase tracking-[0.14em]", completed && "text-white/90")}>
                  {format(day, "EEE")}
                </span>
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2",
                    completed
                      ? "border-white/70 bg-white/20"
                      : "border-dashed border-slate-300 bg-transparent",
                  )}
                >
                  {completed && <Check className="h-3.5 w-3.5 text-white" />}
                </span>
                <span className={cn("text-sm font-semibold", completed && "text-white")}>
                  {format(day, "d")}
                </span>
              </Button>
            )
          })}
        </div>
      </article>
      <HabitDetailsDrawer habit={habit} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </>
  )
}
