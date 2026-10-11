import { useState, type FormEvent } from "react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { RecoveryCodeList } from "./recovery-code-list"
import { useAuth } from "@/features/auth/auth-context"

type Mode = "login" | "signup" | "recovery"
export function LoginForm() {
  const { authenticateWithPasskey, enrollWithPasskey, completeEnrollment, supportsPasskeys } = useAuth()
  const [mode, setMode] = useState<Mode>("login")
  const [email, setEmail] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [recoveryCode, setRecoveryCode] = useState("")
  const [codes, setCodes] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setPending(true)
    try {
      if (mode === "login") await authenticateWithPasskey()
      else setCodes(await enrollWithPasskey(email, displayName, mode === "recovery" ? recoveryCode : undefined))
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to continue.") }
    finally { setPending(false) }
  }
  const switchMode = (next: Mode) => { setMode(next); setError(""); setRecoveryCode("") }
  return <Card className="w-full max-w-md border-white/70 bg-white/90 shadow-soft backdrop-blur">
    <CardHeader className="space-y-2">
      <CardTitle className="text-2xl">{codes.length ? "Save your recovery codes" : mode === "login" ? "Welcome to Cycle" : mode === "signup" ? "Create your account" : "Restore your account"}</CardTitle>
      <CardDescription>{codes.length ? "Your passkey is ready." : mode === "login" ? "Sign in with your passkey. No password or email code needed." : mode === "signup" ? "Your email identifies your account. We don’t send emails or verify ownership of this address." : "Enter your email and a setup or recovery code, then create a replacement passkey. Previous passkeys and sessions will be revoked."}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {!supportsPasskeys && <p role="alert" className="text-sm text-red-600">Use a browser and device that support passkeys to continue.</p>}
      {codes.length ? <>
        <RecoveryCodeList codes={codes} />
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} />I have saved my recovery codes</label>
        <Button className="w-full" disabled={!saved} onClick={completeEnrollment}>Continue to Cycle</Button>
      </> : <>
        <form onSubmit={submit} className="space-y-4">
          {mode !== "login" && <>
            <div className="space-y-2"><label htmlFor="email" className="text-sm font-medium">Email</label><Input id="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></div>
            {mode === "signup" ? <div className="space-y-2"><label htmlFor="displayName" className="text-sm font-medium">Name (optional)</label><Input id="displayName" autoComplete="name" maxLength={80} value={displayName} onChange={e => setDisplayName(e.target.value)} /></div> : <div className="space-y-2"><label htmlFor="recoveryCode" className="text-sm font-medium">Setup or recovery code</label><Input id="recoveryCode" type="password" autoComplete="off" required maxLength={128} value={recoveryCode} onChange={e => setRecoveryCode(e.target.value)} /></div>}
          </>}
          <Button className="w-full" disabled={pending || !supportsPasskeys}>{pending ? "Waiting for passkey…" : mode === "login" ? "Sign in with passkey" : mode === "signup" ? "Create account with passkey" : "Create replacement passkey"}</Button>
        </form>
        <div className="flex flex-wrap justify-center gap-2">
          {mode !== "login" && <Button variant="ghost" disabled={pending} onClick={() => switchMode("login")}>Sign in</Button>}
          {mode !== "signup" && <Button variant="ghost" disabled={pending} onClick={() => switchMode("signup")}>Create account</Button>}
          {mode !== "recovery" && <Button variant="ghost" disabled={pending} onClick={() => switchMode("recovery")}>Recover / set up account</Button>}
        </div>
      </>}
    </CardContent>
  </Card>
}
