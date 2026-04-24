import { NavLink } from "react-router-dom"
import { cn } from "@/lib/utils"

const items: Array<{ to: string; label: string; end?: boolean }> = [
  { to: "/", label: "Recap", end: true },
  { to: "/day", label: "Daily" },
  { to: "/week", label: "Weekly" },
  { to: "/month", label: "Monthly" },
  { to: "/year", label: "Yearly" },
  { to: "/settings", label: "Settings" },
] as const

export function NavMenu() {
  return (
    <nav className="sticky top-0 z-10 mb-8 border-b bg-white/80 backdrop-blur">
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center gap-1 overflow-x-auto py-1 md:gap-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition-all hover:bg-slate-100",
                  isActive ? "bg-slate-900 text-white shadow-sm hover:bg-slate-900" : "text-slate-600",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  )
}
