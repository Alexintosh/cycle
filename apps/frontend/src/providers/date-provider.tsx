import { createContext, useContext, useMemo, useState, type ReactNode } from "react"

type DateContextValue = {
  currentDate: Date
  setCurrentDate: (date: Date) => void
}

const DateContext = createContext<DateContextValue | undefined>(undefined)

export function DateProvider({ children }: { children: ReactNode }) {
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const value = useMemo(() => ({ currentDate, setCurrentDate }), [currentDate])

  return <DateContext.Provider value={value}>{children}</DateContext.Provider>
}

export function useDateContext() {
  const context = useContext(DateContext)
  if (!context) {
    throw new Error("useDateContext must be used within DateProvider")
  }

  return context
}
