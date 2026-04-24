import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { ApiClient, ApiError } from "@/api/client"
import type { SessionTokens, User } from "@/lib/types"

const SESSION_STORAGE_KEY = "habit-tracker.session"

type AuthStatus = "loading" | "authenticated" | "anonymous"

type AuthContextValue = {
  status: AuthStatus
  user: User | null
  api: ApiClient
  requestOtp: (email: string) => Promise<{ email: string; expiresAt: string; isNewUser: boolean; reusedExistingCode: boolean }>
  verifyOtp: (input: { email: string; code: string; displayName?: string }) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function readStoredSession(): SessionTokens | null {
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as SessionTokens
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const initialStoredSession = readStoredSession()
  const [tokens, setTokens] = useState<SessionTokens | null>(initialStoredSession)
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>(initialStoredSession ? "loading" : "anonymous")

  useEffect(() => {
    if (tokens) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(tokens))
    } else {
      window.localStorage.removeItem(SESSION_STORAGE_KEY)
    }
  }, [tokens])

  const api = useMemo(
    () =>
      new ApiClient({
        getTokens: () => tokens,
        setTokens,
      }),
    [tokens],
  )

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      if (!tokens) {
        if (!cancelled) {
          setUser(null)
          setStatus("anonymous")
        }
        return
      }

      try {
        const currentUser = await api.me()
        if (!cancelled) {
          setUser(currentUser)
          setStatus("authenticated")
        }
      } catch (error) {
        if (!cancelled) {
          if (error instanceof ApiError) {
            setTokens(null)
          }
          setUser(null)
          setStatus("anonymous")
        }
      }
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [api, tokens])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      api,
      requestOtp: (email) => api.requestOtp(email),
      verifyOtp: async ({ email, code, displayName }) => {
        const session = await api.verifyOtp(email, code, displayName)
        setTokens({
          token: session.token,
          refreshToken: session.refreshToken,
        })
        setUser(session.user)
        setStatus("authenticated")
      },
      logout: () => {
        setTokens(null)
        setUser(null)
        setStatus("anonymous")
      },
    }),
    [api, status, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider")
  }

  return context
}
