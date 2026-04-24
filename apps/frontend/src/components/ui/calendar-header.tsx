import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDateContext } from "@/providers/date-provider"

export function CalendarHeader() {
  const { currentDate, setCurrentDate } = useDateContext()

  const month = currentDate.getMonth()
  const year = currentDate.getFullYear()

  const monthName = currentDate.toLocaleString("en-US", { month: "long" })

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  return (
    <div className="mb-6 flex items-center justify-between rounded-2xl border bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
      <Button variant="ghost" onClick={handlePrevMonth} aria-label="Previous month">
        <ChevronLeft className="h-5 w-5" />
      </Button>
      <h2 className="text-xl font-semibold">
        {monthName}, {year}
      </h2>
      <Button variant="ghost" onClick={handleNextMonth} aria-label="Next month">
        <ChevronRight className="h-5 w-5" />
      </Button>
    </div>
  )
}
