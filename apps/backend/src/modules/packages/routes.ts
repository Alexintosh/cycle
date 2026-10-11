import { and, eq } from "drizzle-orm"
import { Elysia, t } from "elysia"
import type { AppConfig } from "../../config.ts"
import type { AppDatabase } from "../../db/client.ts"
import { installedPackages } from "../../db/schema.ts"
import { fail, ok } from "../../lib/api.ts"
import { getAuthenticatedUser } from "../../plugins/auth.ts"
import {
  createOwnedPackageForUser,
  getPublicRegistryUpdatedAt,
  getInstalledPackageForUser,
  installPackageForUser,
  listInstalledPackagesForUser,
  listOwnedPackagesForUser,
  listRegistryPackagesForUser,
  removeInstalledPackageForUser,
  updateOwnedPackageForUser,
  updateInstalledPackageForUser,
} from "./service.ts"
import type { PackageRegistry } from "./types.ts"

type RouteContext = any

export function createPackageRoutes(services: {
  db: AppDatabase
  config: AppConfig
  packageRegistry?: PackageRegistry
}) {
  const { db, config } = services

  const packageItemBody = t.Object({
    id: t.Optional(t.String()),
    timeframe: t.String(),
    emoji: t.Optional(t.String()),
    title: t.String(),
    description: t.Optional(t.String()),
    goal: t.Optional(t.Union([t.Number(), t.Null()])),
    section: t.Optional(t.String()),
    color: t.Optional(t.String()),
  })

  const packageBody = t.Object({
    title: t.String(),
    description: t.Optional(t.String()),
    version: t.String(),
    tags: t.Optional(t.Array(t.String())),
    items: t.Array(packageItemBody),
  })

  return new Elysia({ prefix: "/packages" })
    .get(
      "/registry",
      async (context: RouteContext) => {
        const { headers, set, accessJwt } = context
        const user = await getAuthenticatedUser({
          authorization: headers.authorization,
          set,
          accessJwt,
          db,
        })

        if (!user) {
          return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
        }

        const packages = await listRegistryPackagesForUser(db, user.id)
        return ok({
          schemaVersion: 1,
          updatedAt: await getPublicRegistryUpdatedAt(db),
          packages,
        })
      },
      {
        detail: {
          tags: ["Packages"],
          summary: "Browse package registry",
          description: "Return the internal package registry annotated with install and update state for the authenticated user.",
        },
      },
    )
    .get(
      "/mine",
      async (context: RouteContext) => {
        const { headers, set, accessJwt } = context
        const user = await getAuthenticatedUser({
          authorization: headers.authorization,
          set,
          accessJwt,
          db,
          config,
        })

        if (!user) {
          return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
        }

        return ok(await listOwnedPackagesForUser(db, user.id))
      },
      {
        detail: {
          tags: ["Packages"],
          summary: "List owned packages",
          description: "Return the packages created and published by the authenticated user.",
        },
      },
    )
    .post(
      "/",
      async (context: RouteContext) => {
        const { body, headers, set, accessJwt } = context
        const user = await getAuthenticatedUser({
          authorization: headers.authorization,
          set,
          accessJwt,
          db,
          config,
        })

        if (!user) {
          return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
        }

        try {
          const createdPackage = await createOwnedPackageForUser(db, user, body)
          return ok(createdPackage)
        } catch (error) {
          return fail(set, 400, "INVALID_PACKAGE", error instanceof Error ? error.message : "Invalid package.")
        }
      },
      {
        body: packageBody,
        detail: {
          tags: ["Packages"],
          summary: "Create and publish a package",
          description: "Create a new public package owned by the authenticated user.",
        },
      },
    )
    .patch(
      "/:packageId",
      async (context: RouteContext) => {
        const { body, headers, params, set, accessJwt } = context
        const user = await getAuthenticatedUser({
          authorization: headers.authorization,
          set,
          accessJwt,
          db,
          config,
        })

        if (!user) {
          return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
        }

        try {
          const updatedPackage = await updateOwnedPackageForUser(db, user, params.packageId, body)
          if (!updatedPackage) {
            return fail(set, 404, "PACKAGE_NOT_FOUND", "Package not found.")
          }

          return ok(updatedPackage)
        } catch (error) {
          return fail(set, 400, "INVALID_PACKAGE", error instanceof Error ? error.message : "Invalid package.")
        }
      },
      {
        params: t.Object({
          packageId: t.String(),
        }),
        body: packageBody,
        detail: {
          tags: ["Packages"],
          summary: "Update and publish a package",
          description: "Update a public package owned by the authenticated user. Changes are published immediately.",
        },
      },
    )
    .get(
      "/installed",
      async (context: RouteContext) => {
        const { headers, set, accessJwt } = context
        const user = await getAuthenticatedUser({
          authorization: headers.authorization,
          set,
          accessJwt,
          db,
          config,
        })

        if (!user) {
          return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
        }

        return ok(await listInstalledPackagesForUser(db, user.id))
      },
      {
        detail: {
          tags: ["Packages"],
          summary: "List installed packages",
          description: "Return the packages currently installed for the authenticated user.",
        },
      },
    )
    .post(
      "/:packageId/install",
      async (context: RouteContext) => {
        const { headers, params, set, accessJwt } = context
        const user = await getAuthenticatedUser({
          authorization: headers.authorization,
          set,
          accessJwt,
          db,
          config,
        })

        if (!user) {
          return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
        }

        const result = await installPackageForUser(db, user.id, params.packageId)
        if (!result) {
          const existing = await getInstalledPackageForUser(db, user.id, params.packageId)
          if (existing) {
            return fail(set, 409, "PACKAGE_ALREADY_INSTALLED", "Package is already installed.", {
              installation: existing,
            })
          }

          return fail(set, 404, "PACKAGE_NOT_FOUND", "Package not found.")
        }

        return ok(result)
      },
      {
        params: t.Object({
          packageId: t.String(),
        }),
        detail: {
          tags: ["Packages"],
          summary: "Install a package",
          description: "Install a registry package by adding its rituals and upkeep items to the authenticated user's habit list.",
        },
      },
    )
    .post(
      "/:packageId/update",
      async (context: RouteContext) => {
        const { headers, params, set, accessJwt } = context
        const user = await getAuthenticatedUser({
          authorization: headers.authorization,
          set,
          accessJwt,
          db,
          config,
        })

        if (!user) {
          return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
        }

        const result = await updateInstalledPackageForUser(db, user.id, params.packageId)
        if (!result) {
          return fail(set, 404, "PACKAGE_NOT_FOUND", "Package not found.")
        }

        return ok(result)
      },
      {
        params: t.Object({
          packageId: t.String(),
        }),
        detail: {
          tags: ["Packages"],
          summary: "Update an installed package",
          description: "Refresh the titles and descriptions of package-managed items and append any newly published items.",
        },
      },
    )
    .delete(
      "/:packageId",
      async (context: RouteContext) => {
        const { headers, params, set, accessJwt } = context
        const user = await getAuthenticatedUser({
          authorization: headers.authorization,
          set,
          accessJwt,
          db,
          config,
        })

        if (!user) {
          return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
        }

        const [existingInstallation] = await db
          .select()
          .from(installedPackages)
          .where(and(eq(installedPackages.userId, user.id), eq(installedPackages.packageId, params.packageId)))
          .limit(1)

        if (!existingInstallation) {
          return fail(set, 404, "PACKAGE_NOT_INSTALLED", "Package is not installed.")
        }

        return ok(await removeInstalledPackageForUser(db, user.id, params.packageId))
      },
      {
        params: t.Object({
          packageId: t.String(),
        }),
        detail: {
          tags: ["Packages"],
          summary: "Remove an installed package",
          description: "Remove all rituals and upkeep items that came from the specified package.",
        },
      },
    )
}
