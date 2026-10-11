import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useAuth } from "@/features/auth/auth-context"
import { NavMenu } from "@/components/nav-menu"

function FullScreenMessage({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="rounded-2xl border bg-card px-6 py-5 text-sm text-muted-foreground shadow-soft">
        {message}
      </div>
    </div>
  )
}

export function AppShell() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === "loading") {
    return <FullScreenMessage message="Loading your rituals..." />
  }

  if (status !== "authenticated") {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return (
    <div className="relative min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_42%),linear-gradient(180deg,_rgba(248,250,252,0.98),_rgba(255,255,255,1))] dark:bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_42%)]">
      <NavMenu />
      <Outlet />
    </div>
  )
}
