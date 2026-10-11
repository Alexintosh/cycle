import { useCallback, useEffect, useRef, useState } from "react"
import { ApiError } from "@/api/client"
import { useAuth } from "@/features/auth/auth-context"
import type { HabitWithLogs } from "@/lib/types"

type QueryFactory = () => Promise<HabitWithLogs[]>

export function useHabitsQuery(factory: QueryFactory, deps: unknown[]) {
  const { status, user } = useAuth()
  const accountRef = useRef<string | undefined>(user?.id)
  accountRef.current = user?.id
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

    const account = accountRef.current
    try {
      setIsLoading(true)
      setError(null)
      const next = await factoryRef.current()
      if (accountRef.current !== account) return
      setHabits(next)
    } catch (error) {
      if (accountRef.current !== account) return
      const message = error instanceof ApiError ? error.message : "Something went wrong while loading habits."
      setError(message)
    } finally {
      if (accountRef.current === account) setIsLoading(false)
    }
  }, [status, user?.id])

  useEffect(() => {
    void refetch()
  }, [refetch, ...deps])

  useEffect(() => {
    const synced = () => { void refetch() }
    window.addEventListener("cycle:data-synced", synced)
    return () => window.removeEventListener("cycle:data-synced", synced)
  }, [refetch])

  return {
    habits,
    isLoading,
    error,
    refetch,
    setHabits,
  }
}
