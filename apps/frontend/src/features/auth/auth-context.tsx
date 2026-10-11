import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { browserSupportsWebAuthn, startAuthentication, startRegistration, WebAuthnError } from "@simplewebauthn/browser"
import { clearOfflineReads } from "@/offline/store"
import { ApiClient, ApiError } from "@/api/client"
import type { PasskeySummary, SessionTokens, User } from "@/lib/types"

const SESSION_STORAGE_KEY = "habit-tracker.session"
const PROFILE_STORAGE_KEY = "cycle.offline-profile"
function storedProfile(): User | null {
  try { return JSON.parse(window.localStorage.getItem(PROFILE_STORAGE_KEY) ?? "null") } catch { return null }
}

type AuthStatus = "loading" | "authenticated" | "anonymous"

type AuthContextValue = {
  status: AuthStatus
  user: User | null
  api: ApiClient
  supportsPasskeys: boolean
  isBypassAuth: boolean
  authMode: "standard" | "bypass" | null
  enrollWithPasskey: (email: string, displayName?: string, recoveryCode?: string) => Promise<string[]>
  completeEnrollment: () => void
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
  const [pendingEnrollment, setPendingEnrollment] = useState<(SessionTokens & { user: User }) | null>(null)
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

  const tokensRef = useRef(tokens)
  const userRef = useRef(user)
  tokensRef.current = tokens
  userRef.current = user
  const updateTokens = (next: SessionTokens | null) => { tokensRef.current = next; setTokens(next) }
  const updateUser = (next: User) => {
    userRef.current = next
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next))
    setUser(next)
  }
  const api = useMemo(() => new ApiClient({
    getTokens: () => tokensRef.current,
    getAuthMode: () => userRef.current?.authMode,
    getUserId: () => tokensRef.current ? (userRef.current ?? storedProfile())?.id : undefined,
    setTokens: next => { tokensRef.current = next; setTokens(next) },
  }), [])

  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== SESSION_STORAGE_KEY) return
      tokensRef.current = readStoredSession()
      userRef.current = storedProfile()
      setTokens(tokensRef.current)
      setStatus("loading")
    }
    window.addEventListener("storage", changed)
    return () => window.removeEventListener("storage", changed)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        let modeResult: { mode: "standard" | "bypass" }
        try { modeResult = await api.authMode() }
        catch (error) {
          if (!tokens || !(error instanceof TypeError || (error instanceof ApiError && error.code === "OFFLINE_UNAVAILABLE"))) throw error
          modeResult = { mode: "standard" }
        }
        if (!cancelled) {
          setAuthMode(modeResult.mode)
        }

        const currentUser = await api.me()
        if (!cancelled) {
          updateUser(currentUser)
          setAuthMode(currentUser.authMode ?? modeResult.mode)
          setStatus("authenticated")
        }
      } catch (error) {
        if (!cancelled) {
          if (error instanceof ApiError && tokens && ["UNAUTHORIZED", "INVALID_TOKEN"].includes(error.code)) {
            updateTokens(null)
          }
          setUser(null)
          setStatus("anonymous")
        }
      }
    }

    const revalidate = () => { void bootstrap() }
    window.addEventListener("online", revalidate)
    void bootstrap()
    return () => {
      window.removeEventListener("online", revalidate)
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
      enrollWithPasskey: async (email, displayName, recoveryCode) => {
        try {
          const registration = await api.beginEnrollment(email.trim().toLowerCase(), displayName?.trim() || undefined, recoveryCode?.trim() || undefined)
          const response = await startRegistration({ optionsJSON: registration.options })
          const session = await api.finishEnrollment(registration.challengeId, response)
          setPendingEnrollment(session)
          return session.recoveryCodes
        } catch (error) {
          throw new Error(getPasskeyErrorMessage(error, "Unable to create your passkey."))
        }
      },
      completeEnrollment: () => {
        if (!pendingEnrollment) return
        updateTokens({ token: pendingEnrollment.token, refreshToken: pendingEnrollment.refreshToken })
        updateUser(pendingEnrollment.user)
        setAuthMode("standard")
        setStatus("authenticated")
        setPendingEnrollment(null)
      },
      requestOtp: (email) => api.requestOtp(email),
      verifyOtp: async ({ email, code, displayName }) => {
        const session = await api.verifyOtp(email, code, displayName)
        updateTokens({
          token: session.token,
          refreshToken: session.refreshToken,
        })
        updateUser(session.user)
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
          updateTokens({
            token: session.token,
            refreshToken: session.refreshToken,
          })
          updateUser(session.user)
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
        const account = userRef.current?.id
        void api.logout().catch(() => undefined)
        tokensRef.current = null
        userRef.current = null
        window.localStorage.removeItem(PROFILE_STORAGE_KEY)
        if (account) void clearOfflineReads(account).catch(() => undefined)
        updateTokens(null)
        setUser(null)
        setAuthMode("standard")
        setStatus("anonymous")
      },
    }),
    [api, authMode, isBypassAuth, status, supportsPasskeys, user, pendingEnrollment],
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
