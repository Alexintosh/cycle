import type { InstalledPackageRecord } from "../../db/schema.ts"

export type PackageTimeframe = "daily" | "weekly" | "monthly" | "quarterly" | "semiannual" | "yearly"

export type PackageItemDefinition = {
  id: string
  timeframe: PackageTimeframe
  emoji?: string
  title: string
  description?: string
  goal?: number | null
  section: string
  color?: string
}

export type PackageDefinition = {
  id: string
  title: string
  description: string
  author: string
  version: string
  tags: string[]
  items: PackageItemDefinition[]
}

export type PackageUpsertInput = {
  title: string
  description?: string
  version: string
  tags?: string[]
  items: Array<{
    id?: string
    timeframe: string
    emoji?: string
    title: string
    description?: string
    goal?: number | null
    section?: string
    color?: string
  }>
}

export type PackageRegistry = {
  schemaVersion: number
  updatedAt: string
  packages: PackageDefinition[]
}

export type PackageVersionStatus = "not-installed" | "current" | "update-available" | "ahead" | "unknown"

export type PackageInstallationSummary = Pick<
  InstalledPackageRecord,
  "id" | "packageId" | "title" | "description" | "author" | "installedVersion" | "installedAt" | "updatedAt"
> & {
  habitCount: number
}

export type RegistryPackageSummary = PackageDefinition & {
  itemCount: number
  installation: PackageInstallationSummary | null
  versionStatus: PackageVersionStatus
  hasUpdate: boolean
}

export type OwnedPackageSummary = PackageDefinition & {
  itemCount: number
  createdAt: Date
  updatedAt: Date
}
