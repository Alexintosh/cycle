import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { browserSupportsWebAuthn, startAuthentication, startRegistration, WebAuthnError } from "@simplewebauthn/browser"
import { ApiClient, ApiError } from "@/api/client"
import type { PasskeySummary, SessionTokens, User } from "@/lib/types"

const SESSION_STORAGE_KEY = "habit-tracker.session"

type AuthStatus = "loading" | "authenticated" | "anonymous"

type AuthContextValue = {
  status: AuthStatus
  user: User | null
  api: ApiClient
  supportsPasskeys: boolean
  isBypassAuth: boolean
  authMode: "standard" | "bypass" | null
  requestOtp: (email: string) => Promise<{ email: string; expiresAt: string; isNewUser: boolean; reusedExistingCode: boolean }>
  verifyOtp: (input: { email: string; code: string; displayName?: string }) => Promise<void>
  createPasskey: (name?: string) => Promise<PasskeySummary>
  authenticateWithPasskey: () => Promise<void>
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

function getPasskeyErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return error.message
  }

  if (error instanceof WebAuthnError) {
    if (error.code === "ERROR_CEREMONY_ABORTED") {
      return "Passkey request was cancelled."
    }

    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return fallback
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const initialStoredSession = readStoredSession()
  const [tokens, setTokens] = useState<SessionTokens | null>(initialStoredSession)
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>("loading")
  const [authMode, setAuthMode] = useState<"standard" | "bypass" | null>(null)
  const supportsPasskeys = browserSupportsWebAuthn()
  const isBypassAuth = authMode === "bypass" || user?.authMode === "bypass"

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
      try {
        const modeResult = await api.authMode()
        if (!cancelled) {
          setAuthMode(modeResult.mode)
        }

        const currentUser = await api.me()
        if (!cancelled) {
          setUser(currentUser)
          setAuthMode(currentUser.authMode ?? modeResult.mode)
          setStatus("authenticated")
        }
      } catch (error) {
        if (!cancelled) {
          if (error instanceof ApiError && tokens) {
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
      supportsPasskeys,
      isBypassAuth,
      authMode,
      requestOtp: (email) => api.requestOtp(email),
      verifyOtp: async ({ email, code, displayName }) => {
        const session = await api.verifyOtp(email, code, displayName)
        setTokens({
          token: session.token,
          refreshToken: session.refreshToken,
        })
        setUser(session.user)
        setAuthMode(session.user.authMode ?? "standard")
        setStatus("authenticated")
      },
      createPasskey: async (name) => {
        const registration = await api.beginPasskeyRegistration()

        try {
          const response = await startRegistration({
            optionsJSON: registration.options,
          })
          const result = await api.finishPasskeyRegistration({
            challengeId: registration.challengeId,
            response,
            name: name?.trim() || undefined,
          })
          return result.passkey
        } catch (error) {
          throw new Error(getPasskeyErrorMessage(error, "Unable to create passkey."))
        }
      },
      authenticateWithPasskey: async () => {
        const authentication = await api.beginPasskeyAuthentication()

        try {
          const response = await startAuthentication({
            optionsJSON: authentication.options,
          })
          const session = await api.finishPasskeyAuthentication({
            challengeId: authentication.challengeId,
            response,
          })
          setTokens({
            token: session.token,
            refreshToken: session.refreshToken,
          })
          setUser(session.user)
          setAuthMode(session.user.authMode ?? "standard")
          setStatus("authenticated")
        } catch (error) {
          throw new Error(getPasskeyErrorMessage(error, "Unable to sign in with passkey."))
        }
      },
      logout: () => {
        if (isBypassAuth) {
          return
        }
        setTokens(null)
        setUser(null)
        setAuthMode("standard")
        setStatus("anonymous")
      },
    }),
    [api, authMode, isBypassAuth, status, supportsPasskeys, user],
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
