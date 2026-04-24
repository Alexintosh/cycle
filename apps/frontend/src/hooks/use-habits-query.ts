import { useCallback, useEffect, useRef, useState } from "react"
import { ApiError } from "@/api/client"
import { useAuth } from "@/features/auth/auth-context"
import type { HabitWithLogs } from "@/lib/types"

type QueryFactory = () => Promise<HabitWithLogs[]>

export function useHabitsQuery(factory: QueryFactory, deps: unknown[]) {
  const { status } = useAuth()
  const [habits, setHabits] = useState<HabitWithLogs[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const factoryRef = useRef(factory)

  useEffect(() => {
    factoryRef.current = factory
  }, [factory])

  const refetch = useCallback(async () => {
    if (status !== "authenticated") {
      setHabits([])
      setError(null)
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      const next = await factoryRef.current()
      setHabits(next)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Something went wrong while loading habits."
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [status])

  useEffect(() => {
    void refetch()
  }, [refetch, ...deps])

  return {
    habits,
    isLoading,
    error,
    refetch,
    setHabits,
  }
}
