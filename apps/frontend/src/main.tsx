import React from "react"
import ReactDOM from "react-dom/client"
import { RouterProvider } from "react-router-dom"
import { ThemeProvider } from "next-themes"
import { router } from "@/router"
import "@/styles/globals.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="cycle-theme" disableTransitionOnChange>
      <RouterProvider router={router} />
    </ThemeProvider>
  </React.StrictMode>,
)
