import { cacheRead, cacheHabits, cachedResponse, readOffline, projectHabits, enqueueCheckIn, acknowledgeCheckIn, type CheckIn } from "@/offline/store"
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser"
import type {
  HabitWithLogs,
  InstalledPackageSummary,
  PackageRegistryPayload,
  PasskeySummary,
  SessionTokens,
  User,
} from "@/lib/types"

function normalizeBasePath(baseUrl: string) {
  if (baseUrl === "/") {
    return ""
  }

  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
}

const APP_BASE_PATH = normalizeBasePath(import.meta.env.BASE_URL ?? "/")
const apiBaseUrlOverride = import.meta.env.VITE_API_BASE_URL
const API_BASE_URL =
  apiBaseUrlOverride && apiBaseUrlOverride !== "__AUTO__" ? apiBaseUrlOverride : `${APP_BASE_PATH}/api`

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
  getUserId?: () => string | undefined
  setTokens: (tokens: SessionTokens | null) => void
}

type BackendHabitLog = {
  id: string
  habitId: string
  logDate: string
  loggedAt: string
  note: string | null
}

export type BackendHabit = {
  id: string
  name: string
  description: string
  frequency: HabitWithLogs["frequency"]
  category: string
  goal: number | null
  color: string
  emoji?: string
  sourceType?: "manual" | "package"
  packageId?: string | null
  packageItemId?: string | null
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
  private refreshInFlight?: Promise<SessionTokens>
  private syncInFlight?: Promise<void>

  constructor(tokenSource?: TokenSource) {
    this.tokenSource = tokenSource
  }

  private async request<T>(path: string, init: RequestInit = {}, allowRefresh = true): Promise<T> {
    const headers = new Headers(init.headers)
    if (init.body != null && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json")
    }

    const tokens = this.tokenSource?.getTokens() ?? null
    if (tokens?.token) {
      headers.set("Authorization", `Bearer ${tokens.token}`)
    }

    const scope = this.tokenSource?.getUserId?.()
    const method = init.method ?? "GET"
    if (method !== "GET" && /^\/(habits|packages|data)(?:\/|$)/.test(path) && path !== "/habits/sync" && scope) {
      if (!navigator.onLine) throw new ApiError("OFFLINE_UNAVAILABLE", "Connect to the internet to manage rituals, packages or imports. Check-ins remain available offline.")
      if ((await readOffline(scope)).pending.length) throw new ApiError("SYNC_PENDING", "Sync your pending check-ins before changing rituals or packages.")
    }
    if (!navigator.onLine && method === "GET" && scope && tokens) {
      const cached = await cachedResponse(scope, path)
      if (cached !== undefined) return cached as T
      throw new ApiError("OFFLINE_UNAVAILABLE", "This data is not saved on this device yet. Connect once to load it.")
    }
    let response: Response
    try {
      response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers })
    } catch (error) {
      if (error instanceof TypeError && method === "GET" && scope && tokens) {
        const cached = await cachedResponse(scope, path)
        if (cached !== undefined) return cached as T
        throw new ApiError("OFFLINE_UNAVAILABLE", "This data is not saved on this device yet. Connect once to load it.")
      }
      throw error
    }

    const payload = (await response.json()) as ApiResponse<T>

    if (response.status === 401 && allowRefresh && tokens?.refreshToken && this.tokenSource) {
      this.refreshInFlight ??= this.refresh(tokens.refreshToken).finally(() => { this.refreshInFlight = undefined })
      const refreshed = await this.refreshInFlight
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

    if (method === "GET" && !path.startsWith("/habits") && scope && this.tokenSource?.getUserId?.() === scope) {
      // Account data lives in IndexedDB, never in shared Service Worker caches.
      await cacheRead(scope, path, payload.data).catch(() => undefined)
    }
    if (method !== "GET" && scope && /^\/(habits|packages|data)(?:\/|$)/.test(path) && path !== "/habits/sync") {
      await this.prepareOffline().catch(() => undefined)
    }
    return payload.data
  }

  async prepareOffline() {
    const scope = this.tokenSource?.getUserId?.()
    if (!scope || !this.tokenSource?.getTokens() || !navigator.onLine) return
    const habits = await this.request<BackendHabit[]>("/habits?includeLogs=true")
    if (this.tokenSource.getUserId?.() === scope) await cacheHabits(scope, habits)
  }

  syncOffline() {
    if (this.syncInFlight) return this.syncInFlight
    const scope = this.tokenSource?.getUserId?.()
    if (!scope || !navigator.onLine) return Promise.resolve()
    const synchronize = async () => {
      let changed = false
      while (this.tokenSource?.getUserId?.() === scope && this.tokenSource.getTokens()) {
        const [command] = (await readOffline(scope)).pending
        if (!command) break
        await this.request("/habits/sync", { method: "POST", body: JSON.stringify(command) })
        if (this.tokenSource?.getUserId?.() !== scope) break
        await acknowledgeCheckIn(scope, command.id)
        changed = true
      }
      if (changed && this.tokenSource?.getUserId?.() === scope) {
        await this.prepareOffline()
        window.dispatchEvent(new Event("cycle:data-synced"))
      }
    }
    // Keep command order when several tabs share this account's queue.
    this.syncInFlight = (async () => {
      if (navigator.locks) await navigator.locks.request(`cycle-sync-${scope}`, synchronize)
      else await synchronize()
    })().finally(() => { this.syncInFlight = undefined })
    return this.syncInFlight
  }

  private async checkIn(command: CheckIn) {
    const scope = this.tokenSource?.getUserId?.()
    if (!scope || !this.tokenSource?.getTokens()) throw new ApiError("UNAUTHORIZED", "Sign in to record check-ins.")
    if (!(await readOffline(scope)).habits) {
      try { await this.prepareOffline() } catch { throw new ApiError("OFFLINE_UNAVAILABLE", "Connect once to save your rituals on this device.") }
    }
    // Persist before sending. A crash or lost response is safe to replay.
    await enqueueCheckIn(scope, command)
    await this.syncOffline().catch(() => undefined)
    const habit = projectHabits(await readOffline(scope), { startDate: command.date, endDate: command.date, includeLogs: true })?.find(habit => habit.id === command.habitId)
    if (!habit) throw new ApiError("HABIT_REMOVED", "This ritual is unavailable on this device.")
    return mapHabit(habit)
  }

  beginEnrollment(email: string, displayName?: string, recoveryCode?: string) {
    return this.request<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }>("/auth/enroll/options", {
      method: "POST", body: JSON.stringify({ email, displayName, recoveryCode }),
    }, false)
  }

  finishEnrollment(challengeId: string, response: RegistrationResponseJSON) {
    return this.request<SessionTokens & { user: User; recoveryCodes: string[] }>("/auth/enroll/verify", {
      method: "POST", body: JSON.stringify({ challengeId, response }),
    }, false)
  }

  regenerateRecoveryCodes() {
    return this.request<{ recoveryCodes: string[] }>("/auth/recovery-codes", { method: "POST" })
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

  logout() {
    return this.request<{ message: string }>("/auth/logout", { method: "POST" }, false)
  }

  me() {
    return this.request<User>("/auth/me")
  }

  authMode() {
    return this.request<{ mode: "standard" | "bypass" }>("/auth/mode", {}, false)
  }

  listPasskeys() {
    return this.request<PasskeySummary[]>("/auth/passkeys")
  }

  beginPasskeyRegistration() {
    return this.request<{
      challengeId: string
      options: PublicKeyCredentialCreationOptionsJSON
    }>("/auth/passkeys/register/options", {
      method: "POST",
    })
  }

  finishPasskeyRegistration(input: {
    challengeId: string
    response: RegistrationResponseJSON
    name?: string
  }) {
    return this.request<{ passkey: PasskeySummary }>("/auth/passkeys/register/verify", {
      method: "POST",
      body: JSON.stringify(input),
    })
  }

  beginPasskeyAuthentication() {
    return this.request<{
      challengeId: string
      options: PublicKeyCredentialRequestOptionsJSON
    }>("/auth/passkeys/authenticate/options", {
      method: "POST",
    }, false)
  }

  finishPasskeyAuthentication(input: {
    challengeId: string
    response: AuthenticationResponseJSON
  }) {
    return this.request<{ token: string; refreshToken: string; user: User }>("/auth/passkeys/authenticate/verify", {
      method: "POST",
      body: JSON.stringify(input),
    }, false)
  }

  deletePasskey(passkeyId: string) {
    return this.request<{ removed: true }>(`/auth/passkeys/${passkeyId}`, {
      method: "DELETE",
    })
  }

  listHabits(params: Record<string, string | boolean | undefined> = {}) {
    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        searchParams.set(key, String(value))
      }
    }

    const query = searchParams.size ? `?${searchParams.toString()}` : ""
    return this.readHabits(`/habits${query}`)
  }

  private async readHabits(path: string) {
    const scope = this.tokenSource?.getUserId?.()
    if (scope && this.tokenSource?.getTokens()) {
      const state = await readOffline(scope)
      if (!navigator.onLine || state.pending.length) {
        const cached = await cachedResponse(scope, path) as BackendHabit[] | undefined
        if (cached) return cached.map(mapHabit)
      }
    }
    return this.request<BackendHabit[]>(path).then(habits => habits.map(mapHabit))
  }

  getCompletedNonDaily(date: string) {
    return this.readHabits(`/habits/completed-non-daily?date=${date}`)
  }

  listPackageRegistry() {
    return this.request<PackageRegistryPayload>("/packages/registry")
  }

  listInstalledPackages() {
    return this.request<InstalledPackageSummary[]>("/packages/installed")
  }

  installPackage(packageId: string) {
    return this.request<{
      installation: InstalledPackageSummary
      addedHabits: number
    }>(`/packages/${packageId}/install`, {
      method: "POST",
    })
  }

  updatePackage(packageId: string) {
    return this.request<{
      installation: InstalledPackageSummary
      previousVersion: string
      currentVersion: string
      updatedHabits: number
      addedHabits: number
    }>(`/packages/${packageId}/update`, {
      method: "POST",
    })
  }

  removePackage(packageId: string) {
    return this.request<{
      removed: true
      deletedHabits: number
    }>(`/packages/${packageId}`, {
      method: "DELETE",
    })
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
    return this.checkIn({ id: crypto.randomUUID(), habitId, kind: "set-day", date, completed, loggedAt: new Date().toISOString() })
  }

  addLog(habitId: string, date: string, count = 1) {
    return this.checkIn({ id: crypto.randomUUID(), habitId, kind: "add-log", date, count, loggedAt: new Date().toISOString() })
  }

  exportData() {
    return this.request<{
      version: number
      exportedAt: string
      habits: Array<Record<string, unknown>>
      packages?: Array<Record<string, unknown>>
      logs: Array<Record<string, unknown>>
    }>("/data/export")
  }

  importData(payload: {
    version?: number
    mode?: "replace" | "append"
    habits: Array<Record<string, unknown>>
    packages?: Array<Record<string, unknown>>
    logs: Array<Record<string, unknown>>
  }) {
    return this.request<{ importedHabits: number; importedPackages?: number; importedLogs: number }>("/data/import", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  }
}

export { ApiError }
