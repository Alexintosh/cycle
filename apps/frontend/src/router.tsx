import { createBrowserRouter, Navigate } from "react-router-dom"
import { AppProviders } from "@/providers/app-providers"
import { AppShell } from "@/shell/app-shell"
import { LoginPage } from "@/routes/login-page"
import { RecapPage } from "@/routes/recap-page"
import { DayPage } from "@/routes/day-page"
import { WeekPage } from "@/routes/week-page"
import { MonthPage } from "@/routes/month-page"
import { YearPage } from "@/routes/year-page"
import { SettingsPage } from "@/routes/settings-page"
import { PackagesPage } from "@/routes/packages-page"

function normalizeRouterBasename(baseUrl: string) {
  if (baseUrl === "/") {
    return "/"
  }

  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
}

export const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <AppProviders />,
      children: [
        {
          path: "/login",
          element: <LoginPage />,
        },
        {
          element: <AppShell />,
          children: [
            { index: true, element: <RecapPage /> },
            { path: "day", element: <DayPage /> },
            { path: "week", element: <WeekPage /> },
            { path: "month", element: <MonthPage /> },
            { path: "year", element: <YearPage /> },
            { path: "packages", element: <PackagesPage /> },
            { path: "settings", element: <SettingsPage /> },
          ],
        },
        {
          path: "*",
          element: <Navigate to="/" replace />,
        },
      ],
    },
  ],
  {
    basename: normalizeRouterBasename(import.meta.env.BASE_URL ?? "/"),
  },
)
