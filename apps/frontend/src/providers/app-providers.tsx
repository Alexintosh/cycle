import { Outlet } from "react-router-dom"
import { Toaster } from "sonner"
import { AuthProvider } from "@/features/auth/auth-context"
import { DateProvider } from "@/providers/date-provider"

export function AppProviders() {
  return (
    <AuthProvider>
      <DateProvider>
        <Outlet />
        <Toaster richColors position="top-right" />
      </DateProvider>
    </AuthProvider>
  )
}
