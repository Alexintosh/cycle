import type { HabitWithLogs, SessionTokens, User } from "@/lib/types"

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3101"

type SuccessResponse<T> = {
  success: true
  data: T
}

type ErrorResponse = {
  success: false
  error: {
    code: string
    message: string
    [key: string]: unknown
  }
}

type ApiResponse<T> = SuccessResponse<T> | ErrorResponse

type TokenSource = {
  getTokens: () => SessionTokens | null
  setTokens: (tokens: SessionTokens | null) => void
}

type BackendHabitLog = {
  id: string
  habitId: string
  logDate: string
  loggedAt: string
  note: string | null
}

type BackendHabit = {
  id: string
  name: string
  description: string
  frequency: HabitWithLogs["frequency"]
  category: string
  goal: number | null
  color: string
  emoji?: string
  order: number
  createdAt: string
  updatedAt: string
  achieved: number
  logs: BackendHabitLog[]
  stats: HabitWithLogs["stats"]
}

class ApiError extends Error {
  code: string
  details?: Record<string, unknown>

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = "ApiError"
    this.code = code
    this.details = details
  }
}

function mapHabit(habit: BackendHabit): HabitWithLogs {
  return {
    ...habit,
    emoji: habit.emoji ?? "✨",
    logs: habit.logs.map((log) => ({
      id: log.id,
      habitId: log.habitId,
      date: log.logDate,
      completed: true,
      loggedAt: log.loggedAt,
      note: log.note,
    })),
  }
}

export class ApiClient {
  private tokenSource?: TokenSource

  constructor(tokenSource?: TokenSource) {
    this.tokenSource = tokenSource
  }

  private async request<T>(path: string, init: RequestInit = {}, allowRefresh = true): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set("Content-Type", "application/json")

    const tokens = this.tokenSource?.getTokens() ?? null
    if (tokens?.token) {
      headers.set("Authorization", `Bearer ${tokens.token}`)
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
    })

    const payload = (await response.json()) as ApiResponse<T>

    if (response.status === 401 && allowRefresh && tokens?.refreshToken && this.tokenSource) {
      const refreshed = await this.refresh(tokens.refreshToken)
      this.tokenSource.setTokens(refreshed)
      return this.request<T>(path, init, false)
    }

    if (!response.ok || !payload.success) {
      const errorPayload = payload as ErrorResponse
      throw new ApiError(
        errorPayload.error?.code ?? "UNKNOWN_ERROR",
        errorPayload.error?.message ?? "Request failed",
        errorPayload.error ?? undefined,
      )
    }

    return payload.data
  }

  requestOtp(email: string) {
    return this.request<{ email: string; expiresAt: string; isNewUser: boolean; reusedExistingCode: boolean }>(
      "/auth/request-otp",
      {
        method: "POST",
        body: JSON.stringify({ email }),
      },
      false,
    )
  }

  verifyOtp(email: string, code: string, displayName?: string) {
    return this.request<{ token: string; refreshToken: string; user: User }>(
      "/auth/verify-otp",
      {
        method: "POST",
        body: JSON.stringify({ email, code, displayName }),
      },
      false,
    )
  }

  refresh(refreshToken: string) {
    return this.request<SessionTokens>(
      "/auth/refresh",
      {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      },
      false,
    )
  }

  me() {
    return this.request<User>("/auth/me")
  }

  listHabits(params: Record<string, string | boolean | undefined> = {}) {
    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        searchParams.set(key, String(value))
      }
    }

    const query = searchParams.size ? `?${searchParams.toString()}` : ""
    return this.request<BackendHabit[]>(`/habits${query}`).then((habits) => habits.map(mapHabit))
  }

  getCompletedNonDaily(date: string) {
    return this.request<BackendHabit[]>(`/habits/completed-non-daily?date=${date}`).then((habits) => habits.map(mapHabit))
  }

  createHabit(input: {
    name: string
    description?: string
    frequency: HabitWithLogs["frequency"]
    category: string
    goal: number | null
    color: string
    emoji?: string
  }) {
    return this.request<BackendHabit>("/habits", {
      method: "POST",
      body: JSON.stringify(input),
    }).then(mapHabit)
  }

  updateHabit(habitId: string, input: Partial<{
    name: string
    description: string
    frequency: HabitWithLogs["frequency"]
    category: string
    goal: number | null
    color: string
    emoji: string
  }>) {
    return this.request<BackendHabit>(`/habits/${habitId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }).then(mapHabit)
  }

  deleteHabit(habitId: string) {
    return this.request<{ deleted: true }>(`/habits/${habitId}`, {
      method: "DELETE",
    })
  }

  deleteAllHabits() {
    return this.request<{ deleted: true }>("/habits", {
      method: "DELETE",
    })
  }

  reorderHabits(items: Array<{ id: string; order: number; category: string }>) {
    return this.request<{ updated: true }>("/habits/reorder", {
      method: "POST",
      body: JSON.stringify({ items }),
    })
  }

  setDayStatus(habitId: string, date: string, completed: boolean) {
    return this.request<BackendHabit>(`/habits/${habitId}/day-status`, {
      method: "PUT",
      body: JSON.stringify({ date, completed }),
    }).then(mapHabit)
  }

  addLog(habitId: string, date: string, count = 1) {
    return this.request<BackendHabit>(`/habits/${habitId}/logs`, {
      method: "POST",
      body: JSON.stringify({ date, count }),
    }).then(mapHabit)
  }

  exportData() {
    return this.request<{
      version: number
      exportedAt: string
      habits: Array<Record<string, unknown>>
      logs: Array<Record<string, unknown>>
    }>("/data/export")
  }

  importData(payload: {
    version?: number
    mode?: "replace" | "append"
    habits: Array<Record<string, unknown>>
    logs: Array<Record<string, unknown>>
  }) {
    return this.request<{ importedHabits: number; importedLogs: number }>("/data/import", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  }
}

export { ApiError }
