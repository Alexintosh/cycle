import { NavLink } from "react-router-dom"
import { cn } from "@/lib/utils"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { LogoutButton } from "@/components/logout-button"
import { useAuth } from "@/features/auth/auth-context"

const items: Array<{ to: string; label: string; end?: boolean }> = [
  { to: "/", label: "Weekly", end: true },
  { to: "/day", label: "Daily" },
  { to: "/recap", label: "Recap" },
  { to: "/month", label: "Monthly" },
  { to: "/year", label: "Yearly" },
  { to: "/packages", label: "Packages" },
  { to: "/settings", label: "Settings" },
] as const

export function NavMenu() {
  const { resolvedTheme, setTheme } = useTheme()
  const { isBypassAuth } = useAuth()
  const isDark = resolvedTheme === "dark"

  return (
    <nav className="sticky top-0 z-10 mb-8 border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur">
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1 md:gap-2">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-all hover:bg-slate-100 dark:hover:bg-slate-800",
                    isActive ? "bg-slate-900 dark:bg-slate-700 text-white shadow-sm hover:bg-slate-900 dark:hover:bg-slate-700" : "text-slate-600 dark:text-slate-300",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="ghost" size="icon" onClick={() => setTheme(isDark ? "light" : "dark")}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}>
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            {isBypassAuth ? null : <LogoutButton />}
          </div>
        </div>
      </div>
    </nav>
  )
}
