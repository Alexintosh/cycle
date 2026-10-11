import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { and, asc, eq, inArray, sql } from "drizzle-orm"
import type { AppDatabase } from "../../db/client.ts"
import {
  habits,
  installedPackages,
  packageItems,
  packages,
  users,
  type InstalledPackageRecord,
  type PackageItemRecord,
  type PackageRecord,
  type UserRecord,
} from "../../db/schema.ts"
import { getVersionStatus } from "./helpers.ts"
import type {
  PackageDefinition,
  PackageInstallationSummary,
  PackageRegistry,
  PackageUpsertInput,
  PackageTimeframe,
  RegistryPackageSummary,
  OwnedPackageSummary,
} from "./types.ts"

type PackageCatalogOptions = {
  registry?: PackageRegistry
  registryPath?: string
}

const DEFAULT_REGISTRY_PATH = resolve(import.meta.dir, "registry.json")
const PACKAGE_REGISTRY_OWNER_EMAIL = "packages@cycle.local"
const PACKAGE_REGISTRY_OWNER_NAME = "Cycle Library"

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

function normalizePackageInput(input: PackageUpsertInput, author: string): Omit<PackageDefinition, "id"> {
  const title = input.title.trim()
  const version = input.version.trim()

  if (!title) {
    throw new Error("Package title is required.")
  }

  if (!version) {
    throw new Error("Package version is required.")
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("At least one package item is required.")
  }

  const seenItemIds = new Set<string>()
  const items = input.items.map((item) => {
    const itemId = item.id?.trim() || crypto.randomUUID()
    if (seenItemIds.has(itemId)) {
      throw new Error(`Package contains duplicate item id "${itemId}".`)
    }
    seenItemIds.add(itemId)

    if (!isPackageTimeframe(item.timeframe)) {
      throw new Error(`Unsupported timeframe "${item.timeframe}".`)
    }

    const nextTitle = item.title.trim()
    if (!nextTitle) {
      throw new Error("Each package item must have a title.")
    }

    return {
      id: itemId,
      timeframe: item.timeframe,
      emoji: item.emoji?.trim() || "✨",
      title: nextTitle,
      description: item.description?.trim() ?? "",
      goal: item.goal ?? null,
      section: item.section?.trim() || "OTHER",
      color: item.color?.trim() || "#E2E8F0",
    }
  })

  return {
    title,
    description: input.description?.trim() ?? "",
    author,
    version,
    tags: Array.isArray(input.tags) ? input.tags.map((tag) => tag.trim()).filter(Boolean) : [],
    items,
  }
}

function parseTags(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : []
  } catch {
    return []
  }
}

function serializeTimestamp(value: unknown) {
  if (!value) {
    return ""
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === "number") {
    return new Date(value < 1_000_000_000_000 ? value * 1000 : value).toISOString()
  }

  const numericValue = Number(value)
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return new Date(numericValue < 1_000_000_000_000 ? numericValue * 1000 : numericValue).toISOString()
  }

  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString()
}

function mapPackageDefinition(pkg: PackageRecord, items: PackageItemRecord[]): PackageDefinition {
  return {
    id: pkg.id,
    title: pkg.title,
    description: pkg.description,
    author: pkg.author,
    version: pkg.version,
    tags: parseTags(pkg.tags),
    items: items
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((item) => ({
        id: item.itemId,
        timeframe: item.timeframe as PackageTimeframe,
        emoji: item.emoji,
        title: item.title,
        description: item.description,
        goal: item.goal,
        section: item.section,
        color: item.color,
      })),
  }
}

function mapOwnedPackage(pkg: PackageRecord, items: PackageItemRecord[]): OwnedPackageSummary {
  const definition = mapPackageDefinition(pkg, items)
  return {
    ...definition,
    itemCount: definition.items.length,
    createdAt: pkg.createdAt,
    updatedAt: pkg.updatedAt,
  }
}

async function listPackageItems(db: AppDatabase, packageIds: string[]) {
  if (!packageIds.length) {
    return new Map<string, PackageItemRecord[]>()
  }

  const rows = await db
    .select()
    .from(packageItems)
    .where(inArray(packageItems.packageId, packageIds))
    .orderBy(asc(packageItems.packageId), asc(packageItems.sortOrder))

  return rows.reduce((map, row) => {
    const items = map.get(row.packageId) ?? []
    items.push(row)
    map.set(row.packageId, items)
    return map
  }, new Map<string, PackageItemRecord[]>())
}

async function ensureRegistryOwner(db: AppDatabase) {
  const now = new Date()
  const [existingUser] = await db.select().from(users).where(eq(users.email, PACKAGE_REGISTRY_OWNER_EMAIL)).limit(1)

  if (existingUser) {
    return existingUser
  }

  const [createdUser] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      email: PACKAGE_REGISTRY_OWNER_EMAIL,
      displayName: PACKAGE_REGISTRY_OWNER_NAME,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    })
    .returning()

  return createdUser
}

async function replacePackageItems(db: AppDatabase, packageId: string, items: PackageDefinition["items"], now: Date) {
  await db.delete(packageItems).where(eq(packageItems.packageId, packageId))

  if (!items.length) {
    return
  }

  await db.insert(packageItems).values(
    items.map((item, index) => ({
      id: crypto.randomUUID(),
      packageId,
      itemId: item.id,
      timeframe: item.timeframe,
      emoji: item.emoji ?? "✨",
      title: item.title,
      description: item.description ?? "",
      goal: item.goal ?? null,
      section: item.section,
      color: item.color ?? "#E2E8F0",
      sortOrder: index,
      createdAt: now,
      updatedAt: now,
    })),
  )
}

export async function seedPackageRegistry(db: AppDatabase, registry?: PackageRegistry) {
  const catalog = createPackageCatalog(registry ? { registry } : {})
  const owner = await ensureRegistryOwner(db)

  for (const pkg of catalog.listPackages()) {
    const now = new Date()
    const serializedTags = JSON.stringify(pkg.tags)
    const [existingPackage] = await db.select().from(packages).where(eq(packages.id, pkg.id)).limit(1)

    if (existingPackage) {
      await db
        .update(packages)
        .set({
          userId: owner.id,
          title: pkg.title,
          description: pkg.description,
          author: pkg.author,
          version: pkg.version,
          tags: serializedTags,
          updatedAt: now,
        })
        .where(eq(packages.id, pkg.id))
    } else {
      await db.insert(packages).values({
        id: pkg.id,
        userId: owner.id,
        title: pkg.title,
        description: pkg.description,
        author: pkg.author,
        version: pkg.version,
        tags: serializedTags,
        createdAt: now,
        updatedAt: now,
      })
    }

    await replacePackageItems(db, pkg.id, pkg.items, now)
  }

  return catalog.registry
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

export async function listPublicPackages(db: AppDatabase) {
  const rows = await db.select().from(packages).orderBy(asc(packages.title))
  const itemsByPackageId = await listPackageItems(
    db,
    rows.map((row) => row.id),
  )

  return rows.map((row) => mapPackageDefinition(row, itemsByPackageId.get(row.id) ?? []))
}

export async function getPublicRegistryUpdatedAt(db: AppDatabase) {
  const [row] = await db
    .select({
      updatedAt: sql<unknown>`max(${packages.updatedAt})`,
    })
    .from(packages)

  return serializeTimestamp(row?.updatedAt)
}

export async function listOwnedPackagesForUser(db: AppDatabase, userId: string): Promise<OwnedPackageSummary[]> {
  const rows = await db.select().from(packages).where(eq(packages.userId, userId)).orderBy(asc(packages.updatedAt), asc(packages.title))
  const itemsByPackageId = await listPackageItems(
    db,
    rows.map((row) => row.id),
  )

  return rows.map((row) => mapOwnedPackage(row, itemsByPackageId.get(row.id) ?? []))
}

export async function getPackageById(db: AppDatabase, packageId: string) {
  const [row] = await db.select().from(packages).where(eq(packages.id, packageId)).limit(1)
  if (!row) {
    return null
  }

  const itemsByPackageId = await listPackageItems(db, [row.id])
  return mapPackageDefinition(row, itemsByPackageId.get(row.id) ?? [])
}

export async function listRegistryPackagesForUser(
  db: AppDatabase,
  userId: string,
): Promise<RegistryPackageSummary[]> {
  const publicPackages = await listPublicPackages(db)
  const installations = await listInstalledPackagesForUser(db, userId)
  const installationByPackageId = new Map(installations.map((item) => [item.packageId, item]))

  return publicPackages.map((pkg) => {
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
  packageId: string,
) {
  const pkg = await getPackageById(db, packageId)
  if (!pkg) {
    return null
  }

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
  packageId: string,
) {
  const pkg = await getPackageById(db, packageId)
  if (!pkg) {
    return null
  }

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

export async function createOwnedPackageForUser(db: AppDatabase, user: UserRecord, input: PackageUpsertInput) {
  const now = new Date()
  const normalized = normalizePackageInput(input, user.displayName)
  const packageId = crypto.randomUUID()

  await db.insert(packages).values({
    id: packageId,
    userId: user.id,
    title: normalized.title,
    description: normalized.description,
    author: normalized.author,
    version: normalized.version,
    tags: JSON.stringify(normalized.tags),
    createdAt: now,
    updatedAt: now,
  })

  await replacePackageItems(db, packageId, normalized.items, now)

  const createdPackage = await getOwnedPackageByIdForUser(db, user.id, packageId)
  return createdPackage
}

export async function getOwnedPackageByIdForUser(db: AppDatabase, userId: string, packageId: string) {
  const [row] = await db
    .select()
    .from(packages)
    .where(and(eq(packages.userId, userId), eq(packages.id, packageId)))
    .limit(1)

  if (!row) {
    return null
  }

  const itemsByPackageId = await listPackageItems(db, [row.id])
  return mapOwnedPackage(row, itemsByPackageId.get(row.id) ?? [])
}

export async function updateOwnedPackageForUser(db: AppDatabase, user: UserRecord, packageId: string, input: PackageUpsertInput) {
  const [existingPackage] = await db
    .select()
    .from(packages)
    .where(and(eq(packages.userId, user.id), eq(packages.id, packageId)))
    .limit(1)

  if (!existingPackage) {
    return null
  }

  const now = new Date()
  const normalized = normalizePackageInput(input, user.displayName)

  await db
    .update(packages)
    .set({
      title: normalized.title,
      description: normalized.description,
      author: normalized.author,
      version: normalized.version,
      tags: JSON.stringify(normalized.tags),
      updatedAt: now,
    })
    .where(eq(packages.id, existingPackage.id))

  await replacePackageItems(db, existingPackage.id, normalized.items, now)

  return getOwnedPackageByIdForUser(db, user.id, existingPackage.id)
}
