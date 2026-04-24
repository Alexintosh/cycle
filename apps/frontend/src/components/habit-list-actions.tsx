import { useState } from "react"
import { Plus, Trash, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { HabitForm } from "./habit-form"
import { useAuth } from "@/features/auth/auth-context"
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

interface HabitListActionsProps {
  onHabitChange: () => Promise<void>
}

export function HabitListActions({ onHabitChange }: HabitListActionsProps) {
  const { api } = useAuth()
  const [isAddingHabit, setIsAddingHabit] = useState(false)
  const [isDeletingAll, setIsDeletingAll] = useState(false)

  const handleDeleteAll = async () => {
    setIsDeletingAll(true)
    try {
      await api.deleteAllHabits()
      await onHabitChange()
    } finally {
      setIsDeletingAll(false)
    }
  }

  if (isAddingHabit) {
    return <HabitForm onCancel={() => setIsAddingHabit(false)} onSuccess={async () => {
      setIsAddingHabit(false)
      await onHabitChange()
    }} />
  }

  return (
    <div className="flex gap-2">
      <Button onClick={() => setIsAddingHabit(true)} className="flex items-center gap-1">
        <Plus className="h-4 w-4" />
        <span>New Ritual</span>
      </Button>
      
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="flex items-center gap-1" disabled={isDeletingAll}>
            <Trash className="h-4 w-4" />
            <span>{isDeletingAll ? "Deleting..." : "Delete All"}</span>
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete All Rituals
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete all your rituals, upkeep items, and their tracking history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
} 
