import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { and, asc, eq, inArray, sql } from "drizzle-orm"
import type { AppDatabase } from "../../db/client.ts"
import { habits, installedPackages, type InstalledPackageRecord } from "../../db/schema.ts"
import { getVersionStatus } from "./helpers.ts"
import type {
  PackageDefinition,
  PackageInstallationSummary,
  PackageRegistry,
  PackageTimeframe,
  RegistryPackageSummary,
} from "./types.ts"

type PackageCatalogOptions = {
  registry?: PackageRegistry
  registryPath?: string
}

const DEFAULT_REGISTRY_PATH = resolve(import.meta.dir, "registry.json")

function isPackageTimeframe(value: string): value is PackageTimeframe {
  return ["daily", "weekly", "monthly", "quarterly", "semiannual", "yearly"].includes(value)
}

function normalizeRegistry(input: PackageRegistry): PackageRegistry {
  if (!Array.isArray(input.packages)) {
    throw new Error("Package registry is missing a packages array.")
  }

  const seenPackageIds = new Set<string>()

  return {
    schemaVersion: input.schemaVersion,
    updatedAt: input.updatedAt,
    packages: input.packages.map((pkg) => {
      if (!pkg.id?.trim()) {
        throw new Error("Package registry contains a package without an id.")
      }

      if (seenPackageIds.has(pkg.id)) {
        throw new Error(`Package registry contains duplicate package id "${pkg.id}".`)
      }
      seenPackageIds.add(pkg.id)

      const seenItemIds = new Set<string>()
      const items = pkg.items.map((item) => {
        if (!item.id?.trim()) {
          throw new Error(`Package "${pkg.id}" contains an item without an id.`)
        }
        if (seenItemIds.has(item.id)) {
          throw new Error(`Package "${pkg.id}" contains duplicate item id "${item.id}".`)
        }
        seenItemIds.add(item.id)

        if (!isPackageTimeframe(item.timeframe)) {
          throw new Error(`Package "${pkg.id}" contains unsupported timeframe "${item.timeframe}".`)
        }

        return {
          ...item,
          title: item.title.trim(),
          description: item.description?.trim() ?? "",
          section: item.section.trim() || "OTHER",
          goal: item.goal ?? null,
          emoji: item.emoji?.trim() || "✨",
          color: item.color?.trim() || "#E2E8F0",
        }
      })

      return {
        ...pkg,
        title: pkg.title.trim(),
        description: pkg.description.trim(),
        author: pkg.author.trim(),
        version: pkg.version.trim(),
        tags: Array.isArray(pkg.tags) ? pkg.tags.map((tag) => tag.trim()).filter(Boolean) : [],
        items,
      }
    }),
  }
}

export function loadPackageRegistry(options: PackageCatalogOptions = {}) {
  if (options.registry) {
    return normalizeRegistry(options.registry)
  }

  const registryPath = options.registryPath ?? DEFAULT_REGISTRY_PATH
  const content = readFileSync(registryPath, "utf8")
  return normalizeRegistry(JSON.parse(content) as PackageRegistry)
}

export function createPackageCatalog(options: PackageCatalogOptions = {}) {
  const registry = loadPackageRegistry(options)
  const packageMap = new Map(registry.packages.map((pkg) => [pkg.id, pkg]))

  return {
    registry,
    listPackages() {
      return registry.packages
    },
    getPackageById(packageId: string) {
      return packageMap.get(packageId) ?? null
    },
  }
}

function mapInstallationSummary(row: InstalledPackageRecord, habitCount: number): PackageInstallationSummary {
  return {
    id: row.id,
    packageId: row.packageId,
    title: row.title,
    description: row.description,
    author: row.author,
    installedVersion: row.installedVersion,
    installedAt: row.installedAt,
    updatedAt: row.updatedAt,
    habitCount,
  }
}

export async function listInstalledPackagesForUser(db: AppDatabase, userId: string) {
  const installations = await db
    .select()
    .from(installedPackages)
    .where(eq(installedPackages.userId, userId))
    .orderBy(asc(installedPackages.title))

  if (!installations.length) {
    return []
  }

  const packageIds = installations.map((item) => item.packageId)
  const packageHabits = await db
    .select({
      packageId: habits.packageId,
    })
    .from(habits)
    .where(and(eq(habits.userId, userId), inArray(habits.packageId, packageIds)))

  const countsByPackageId = packageHabits.reduce((map, row) => {
    if (!row.packageId) {
      return map
    }

    map.set(row.packageId, (map.get(row.packageId) ?? 0) + 1)
    return map
  }, new Map<string, number>())

  return installations.map((row) => mapInstallationSummary(row, countsByPackageId.get(row.packageId) ?? 0))
}

export async function listRegistryPackagesForUser(
  db: AppDatabase,
  userId: string,
  catalog: ReturnType<typeof createPackageCatalog>,
): Promise<RegistryPackageSummary[]> {
  const installations = await listInstalledPackagesForUser(db, userId)
  const installationByPackageId = new Map(installations.map((item) => [item.packageId, item]))

  return catalog.listPackages().map((pkg) => {
    const installation = installationByPackageId.get(pkg.id) ?? null
    const versionStatus = getVersionStatus(installation?.installedVersion, pkg.version)

    return {
      ...pkg,
      itemCount: pkg.items.length,
      installation,
      versionStatus,
      hasUpdate: versionStatus === "update-available",
    }
  })
}

async function getNextOrderStart(db: AppDatabase, userId: string) {
  const [row] = await db
    .select({
      maxOrder: sql<number>`coalesce(max(${habits.order}), -1)`,
    })
    .from(habits)
    .where(eq(habits.userId, userId))

  return (row?.maxOrder ?? -1) + 1
}

export async function installPackageForUser(
  db: AppDatabase,
  userId: string,
  pkg: PackageDefinition,
) {
  const [existingInstallation] = await db
    .select()
    .from(installedPackages)
    .where(and(eq(installedPackages.userId, userId), eq(installedPackages.packageId, pkg.id)))
    .limit(1)

  if (existingInstallation) {
    return null
  }

  const now = new Date()
  const orderStart = await getNextOrderStart(db, userId)

  await db.insert(installedPackages).values({
    id: crypto.randomUUID(),
    userId,
    packageId: pkg.id,
    title: pkg.title,
    description: pkg.description,
    author: pkg.author,
    installedVersion: pkg.version,
    installedAt: now,
    updatedAt: now,
  })

  if (pkg.items.length) {
    await db.insert(habits).values(
      pkg.items.map((item, index) => ({
        id: crypto.randomUUID(),
        userId,
        name: item.title,
        description: item.description || null,
        category: item.section,
        frequency: item.timeframe,
        goal: item.goal ?? null,
        color: item.color ?? "#E2E8F0",
        emoji: item.emoji ?? "✨",
        sourceType: "package",
        packageId: pkg.id,
        packageItemId: item.id,
        order: orderStart + index,
        createdAt: now,
        updatedAt: now,
      })),
    )
  }

  const [installedRow] = await db
    .select()
    .from(installedPackages)
    .where(and(eq(installedPackages.userId, userId), eq(installedPackages.packageId, pkg.id)))
    .limit(1)

  return {
    installation: mapInstallationSummary(installedRow!, pkg.items.length),
    addedHabits: pkg.items.length,
  }
}

export async function updateInstalledPackageForUser(
  db: AppDatabase,
  userId: string,
  pkg: PackageDefinition,
) {
  const [installation] = await db
    .select()
    .from(installedPackages)
    .where(and(eq(installedPackages.userId, userId), eq(installedPackages.packageId, pkg.id)))
    .limit(1)

  if (!installation) {
    return null
  }

  const existingHabits = await db
    .select()
    .from(habits)
    .where(and(eq(habits.userId, userId), eq(habits.packageId, pkg.id)))
    .orderBy(asc(habits.order))

  const existingByItemId = new Map(
    existingHabits
      .filter((habit) => Boolean(habit.packageItemId))
      .map((habit) => [habit.packageItemId as string, habit]),
  )

  const now = new Date()
  let updatedHabits = 0

  for (const item of pkg.items) {
    const existingHabit = existingByItemId.get(item.id)
    if (!existingHabit) {
      continue
    }

    const nextDescription = item.description || null
    if (existingHabit.name !== item.title || existingHabit.description !== nextDescription) {
      await db
        .update(habits)
        .set({
          name: item.title,
          description: nextDescription,
          updatedAt: now,
        })
        .where(eq(habits.id, existingHabit.id))

      updatedHabits += 1
    }
  }

  const missingItems = pkg.items.filter((item) => !existingByItemId.has(item.id))
  const orderStart = missingItems.length ? await getNextOrderStart(db, userId) : 0

  if (missingItems.length) {
    await db.insert(habits).values(
      missingItems.map((item, index) => ({
        id: crypto.randomUUID(),
        userId,
        name: item.title,
        description: item.description || null,
        category: item.section,
        frequency: item.timeframe,
        goal: item.goal ?? null,
        color: item.color ?? "#E2E8F0",
        emoji: item.emoji ?? "✨",
        sourceType: "package",
        packageId: pkg.id,
        packageItemId: item.id,
        order: orderStart + index,
        createdAt: now,
        updatedAt: now,
      })),
    )
  }

  await db
    .update(installedPackages)
    .set({
      title: pkg.title,
      description: pkg.description,
      author: pkg.author,
      installedVersion: pkg.version,
      updatedAt: now,
    })
    .where(eq(installedPackages.id, installation.id))

  const [updatedInstallation] = await db
    .select()
    .from(installedPackages)
    .where(eq(installedPackages.id, installation.id))
    .limit(1)

  const habitCount = existingHabits.length + missingItems.length

  return {
    installation: mapInstallationSummary(updatedInstallation!, habitCount),
    previousVersion: installation.installedVersion,
    currentVersion: pkg.version,
    updatedHabits,
    addedHabits: missingItems.length,
  }
}

export async function removeInstalledPackageForUser(db: AppDatabase, userId: string, packageId: string) {
  const packageHabits = await db
    .select({ id: habits.id })
    .from(habits)
    .where(and(eq(habits.userId, userId), eq(habits.packageId, packageId)))

  await db.delete(habits).where(and(eq(habits.userId, userId), eq(habits.packageId, packageId)))
  await db.delete(installedPackages).where(and(eq(installedPackages.userId, userId), eq(installedPackages.packageId, packageId)))

  return {
    removed: true,
    deletedHabits: packageHabits.length,
  }
}

export async function getInstalledPackageForUser(db: AppDatabase, userId: string, packageId: string) {
  const installations = await listInstalledPackagesForUser(db, userId)
  return installations.find((item) => item.packageId === packageId) ?? null
}
