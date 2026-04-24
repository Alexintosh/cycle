import { useState, useTransition, type FormEvent } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "./ui/input-otp"
import { useAuth } from "@/features/auth/auth-context"

type LoginStep = "email" | "otp"

export function LoginForm() {
  const { requestOtp, verifyOtp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [step, setStep] = useState<LoginStep>("email")
  const [email, setEmail] = useState("")
  const [otpCode, setOtpCode] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [isNewUser, setIsNewUser] = useState(false)
  const [error, setError] = useState("")
  const [helper, setHelper] = useState("")
  const [isPending, startTransition] = useTransition()

  const redirectPath = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/"

  const handleRequestOtp = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setHelper("")

    startTransition(async () => {
      try {
        const normalizedEmail = email.trim().toLowerCase()
        const result = await requestOtp(normalizedEmail)
        setEmail(normalizedEmail)
        setIsNewUser(result.isNewUser)
        setStep("otp")
        setHelper(`Code sent to ${result.email}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to send code. Please try again.")
      }
    })
  }

  const handleVerifyOtp = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")

    startTransition(async () => {
      try {
        await verifyOtp({
          email,
          code: otpCode,
          displayName: displayName.trim() || undefined,
        })
        navigate(redirectPath, { replace: true })
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid code.")
      }
    })
  }

  const resetToEmail = () => {
    setStep("email")
    setOtpCode("")
    setDisplayName("")
    setError("")
    setHelper("")
  }

  return (
    <Card className="w-full max-w-md border-white/70 bg-white/90 shadow-soft backdrop-blur">
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl">{step === "email" ? "Sign in with email" : "Enter verification code"}</CardTitle>
        <CardDescription>
          {step === "email"
            ? "We will send a one-time code to your inbox."
            : `Use the 6-digit code sent to ${email}.`}
        </CardDescription>
      </CardHeader>
      {step === "email" ? (
        <form onSubmit={handleRequestOtp}>
          <CardContent className="space-y-4">
            {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="email">
                Email
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Sending code..." : "Send code"}
            </Button>
          </CardFooter>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp}>
          <CardContent className="space-y-5">
            {helper ? <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-700">{helper}</p> : null}
            {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}
            {isNewUser ? (
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="displayName">
                  Display name (optional)
                </label>
                <Input
                  id="displayName"
                  name="displayName"
                  autoComplete="name"
                  maxLength={80}
                  placeholder="How should we call you?"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="otp-code">
                Verification code
              </label>
              <InputOTP
                id="otp-code"
                maxLength={6}
                value={otpCode}
                onChange={setOtpCode}
                pattern="^[0-9]+$"
                containerClassName="justify-center"
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
          </CardContent>
          <CardFooter className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={resetToEmail} disabled={isPending}>
              Change email
            </Button>
            <Button type="submit" className="flex-1" disabled={isPending || otpCode.length !== 6}>
              {isPending ? "Verifying..." : "Verify & continue"}
            </Button>
          </CardFooter>
        </form>
      )}
    </Card>
  )
}
