import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { format, addWeeks, subWeeks, startOfWeek, endOfWeek, 
         addMonths, subMonths, startOfMonth, endOfMonth,
         addQuarters, subQuarters, startOfQuarter, endOfQuarter,
         addYears, subYears, startOfYear, endOfYear } from "date-fns"

export type PeriodType = 'week' | 'month' | 'quarter' | 'sixMonths' | 'year'

interface PeriodNavigatorProps {
  currentDate: Date
  onDateChange: (date: Date) => void
  periodType: PeriodType
  className?: string
}

interface PeriodConfig {
  add: (date: Date, amount: number) => Date
  subtract: (date: Date, amount: number) => Date
  start: (date: Date) => Date
  end: (date: Date) => Date
  format: string
  label: string
}

const PERIOD_CONFIGS: Record<PeriodType, PeriodConfig> = {
  week: {
    add: (date) => addWeeks(date, 1),
    subtract: (date) => subWeeks(date, 1),
    start: (date) => startOfWeek(date, { weekStartsOn: 1 }),
    end: (date) => endOfWeek(date, { weekStartsOn: 1 }),
    format: "d MMM",
    label: "Week"
  },
  month: {
    add: (date) => addMonths(date, 1),
    subtract: (date) => subMonths(date, 1),
    start: startOfMonth,
    end: endOfMonth,
    format: "MMM yyyy",
    label: "Month"
  },
  quarter: {
    add: (date) => addQuarters(date, 1),
    subtract: (date) => subQuarters(date, 1),
    start: startOfQuarter,
    end: endOfQuarter,
    format: "QQQ yyyy",
    label: "Quarter"
  },
  sixMonths: {
    add: (date) => addMonths(date, 6),
    subtract: (date) => subMonths(date, 6),
    start: (date) => startOfMonth(date),
    end: (date) => endOfMonth(addMonths(date, 5)),
    format: "MMM yyyy",
    label: "6 Months"
  },
  year: {
    add: (date) => addYears(date, 1),
    subtract: (date) => subYears(date, 1),
    start: startOfYear,
    end: endOfYear,
    format: "yyyy",
    label: "Year"
  }
}

export function PeriodNavigator({ 
  currentDate, 
  onDateChange, 
  periodType,
  className = ""
}: PeriodNavigatorProps) {
  const config = PERIOD_CONFIGS[periodType]
  const periodStart = config.start(currentDate)
  const periodEnd = config.end(currentDate)

  const handlePrevious = () => {
    onDateChange(config.subtract(currentDate, 1))
  }

  const handleNext = () => {
    onDateChange(config.add(currentDate, 1))
  }

  const formatPeriodRange = () => {
    if (periodType === 'week') {
      return `${format(periodStart, "d")}-${format(periodEnd, "d MMM yyyy")}`
    }
    if (periodType === 'sixMonths') {
      return `${format(periodStart, "MMM")}-${format(periodEnd, "MMM yyyy")}`
    }
    return format(periodStart, config.format)
  }

  return (
    <div className={`flex items-center justify-center gap-4 rounded-2xl border bg-white/80 px-4 py-4 shadow-sm backdrop-blur ${className}`}>
      <Button
        variant="outline"
        size="icon"
        onClick={handlePrevious}
        title={`Previous ${config.label}`}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="text-sm font-medium min-w-[120px] text-center">
        {config.label} {formatPeriodRange()}
      </div>
      <Button
        variant="outline"
        size="icon"
        onClick={handleNext}
        title={`Next ${config.label}`}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
} 
