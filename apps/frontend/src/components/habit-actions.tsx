import { Button } from "@/components/ui/button"
import { Edit, Trash } from "lucide-react"
import { HabitWithLogs } from "@/lib/types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface HabitActionsProps {
  habit: HabitWithLogs
  onEdit: (habit: HabitWithLogs) => void
  onDelete: (habitId: string) => Promise<void> | void
}

export function HabitActions({ habit, onEdit, onDelete }: HabitActionsProps) {
  return (
    <div className="flex justify-center gap-1" onClick={(event) => event.stopPropagation()}>
      <Button
        variant="ghost"
        size="icon"
        onClick={(event) => {
          event.stopPropagation()
          onEdit(habit)
        }}
      >
        <Edit className="h-4 w-4" />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={(event) => {
              event.stopPropagation()
            }}
          >
            <Trash className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Habit</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this habit and its tracking history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.stopPropagation()
                void onDelete(habit.id)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
} 
