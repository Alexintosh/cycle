import { PwaStatus } from "@/components/pwa-status"
import { Outlet } from "react-router-dom"
import { Toaster } from "sonner"
import { useTheme } from "next-themes"
import { AuthProvider } from "@/features/auth/auth-context"
import { DateProvider } from "@/providers/date-provider"

export function AppProviders() {
  const { resolvedTheme } = useTheme()
  return (
    <AuthProvider>
      <DateProvider>
        <PwaStatus />
        <Outlet />
        <Toaster theme={resolvedTheme === "dark" ? "dark" : "light"} richColors position="top-right" />
      </DateProvider>
    </AuthProvider>
  )
}
