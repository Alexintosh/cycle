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

export const router = createBrowserRouter([
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
          { path: "settings", element: <SettingsPage /> },
        ],
      },
      {
        path: "*",
        element: <Navigate to="/" replace />,
      },
    ],
  },
])
