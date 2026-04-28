export type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "semiannual" | "yearly"

export const HabitCategories = [
  "MORNING",
  "BREAKFAST",
  "HEALTH",
  "BUILDING",
  "OTHER",
  "ADULTING",
  "SELF IMPROVEMENT",
  "FITNESS",
  "NUTRITION",
  "BED TIME",
] as const

export interface HabitLog {
  id: string
  habitId: string
  date: string
  completed: boolean
  loggedAt?: string
  note?: string | null
}

export interface HabitStats {
  rangeStart: string | null
  rangeEnd: string | null
  logCount: number
  uniqueLoggedDays: number
  goal: number | null
  isGoalMet: boolean | null
  suggestedFrequencyPeriod: {
    start: string
    end: string
  }
}

export interface Habit {
  id: string
  name: string
  description: string
  frequency: Frequency
  category: string
  goal: number | null
  color: string
  emoji?: string
  sourceType?: "manual" | "package"
  packageId?: string | null
  packageItemId?: string | null
  order: number
  createdAt: string
  updatedAt: string
}

export interface HabitWithLogs extends Habit {
  logs: HabitLog[]
  achieved: number
  stats: HabitStats
}

export interface User {
  id: string
  email: string
  displayName: string
  lastLoginAt?: string | null
  authMode?: "standard" | "bypass"
}

export interface SessionTokens {
  token: string
  refreshToken: string
}

export interface PasskeySummary {
  id: string
  name: string
  deviceType: "singleDevice" | "multiDevice"
  backedUp: boolean
  transports: string[]
  createdAt: string
  lastUsedAt: string | null
}

export interface PackageItemDefinition {
  id: string
  timeframe: Frequency
  emoji?: string
  title: string
  description: string
  goal: number | null
  section: string
  color?: string
}

export type PackageVersionStatus = "not-installed" | "current" | "update-available" | "ahead" | "unknown"

export interface InstalledPackageSummary {
  id: string
  packageId: string
  title: string
  description: string | null
  author: string
  installedVersion: string
  installedAt: string
  updatedAt: string
  habitCount: number
}

export interface RegistryPackage {
  id: string
  title: string
  description: string
  author: string
  version: string
  tags: string[]
  items: PackageItemDefinition[]
  itemCount: number
  installation: InstalledPackageSummary | null
  versionStatus: PackageVersionStatus
  hasUpdate: boolean
}

export interface PackageRegistryPayload {
  schemaVersion: number
  updatedAt: string
  packages: RegistryPackage[]
}

export interface PackageRegistryEntry {
  id: string
  name: string
  description: string | null
  latestVersion: string
}

export interface InstalledPackage {
  id: string
  name: string
  version: string
  latestVersion: string | null
}

export interface PackageRegistryWithInstallState extends PackageRegistryEntry {
  installedVersion: string | null
  isInstalled: boolean
  hasUpdate: boolean
}
