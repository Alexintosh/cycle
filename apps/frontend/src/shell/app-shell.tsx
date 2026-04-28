import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useAuth } from "@/features/auth/auth-context"
import { NavMenu } from "@/components/nav-menu"
import { LogoutButton } from "@/components/logout-button"

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
  const { isBypassAuth, status } = useAuth()
  const location = useLocation()

  if (status === "loading") {
    return <FullScreenMessage message="Loading your rituals..." />
  }

  if (status !== "authenticated") {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_42%),linear-gradient(180deg,_rgba(248,250,252,0.98),_rgba(255,255,255,1))]">
      <NavMenu />
      {isBypassAuth ? null : (
        <div className="absolute right-4 top-3 z-20 md:right-8">
          <LogoutButton />
        </div>
      )}
      <Outlet />
    </div>
  )
}
