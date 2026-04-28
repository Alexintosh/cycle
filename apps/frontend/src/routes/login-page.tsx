import { Navigate } from "react-router-dom"
import { LoginForm } from "@/components/login-form"
import { useAuth } from "@/features/auth/auth-context"

export function LoginPage() {
  const { authMode, status } = useAuth()

  if (status === "authenticated") {
    return <Navigate to="/" replace />
  }

  if (status === "loading") {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Checking access…</div>
  }

  if (authMode === "bypass") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center">
        <div className="rounded-2xl border bg-white px-6 py-5 text-sm text-slate-600 shadow-soft">
          Access is managed by this deployment. The login screen is disabled.
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.22),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(34,197,94,0.18),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#eef6ff_100%)] px-4 py-10">
      <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(to_right,rgba(148,163,184,0.15)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.15)_1px,transparent_1px)] [background-size:3rem_3rem]" />
      <div className="relative grid w-full max-w-5xl gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="hidden rounded-[2rem] border border-white/70 bg-white/70 p-10 shadow-soft backdrop-blur lg:block">
          <div className="max-w-xl space-y-6">
            <span className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
              Rebuilt frontend
            </span>
            <h1 className="text-5xl font-semibold tracking-tight text-slate-950">
              Habits, recaps, and long-term momentum in one clean workspace.
            </h1>
            <p className="text-lg leading-8 text-slate-600">
              Sign in with your email, get a one-time code, and pick up right where the new API leaves off.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border bg-white p-4">
                <p className="text-sm text-slate-500">Daily</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">Focus</p>
              </div>
              <div className="rounded-2xl border bg-white p-4">
                <p className="text-sm text-slate-500">Weekly</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">Rhythm</p>
              </div>
              <div className="rounded-2xl border bg-white p-4">
                <p className="text-sm text-slate-500">Long-term</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">Progress</p>
              </div>
            </div>
          </div>
        </section>
        <div className="flex items-center justify-center">
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
