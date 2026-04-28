import { and, eq } from "drizzle-orm"
import { Elysia, t } from "elysia"
import type { AppConfig } from "../../config.ts"
import type { AppDatabase } from "../../db/client.ts"
import { installedPackages } from "../../db/schema.ts"
import { fail, ok } from "../../lib/api.ts"
import { getAuthenticatedUser } from "../../plugins/auth.ts"
import {
  createPackageCatalog,
  getInstalledPackageForUser,
  installPackageForUser,
  listInstalledPackagesForUser,
  listRegistryPackagesForUser,
  removeInstalledPackageForUser,
  updateInstalledPackageForUser,
} from "./service.ts"
import type { PackageRegistry } from "./types.ts"

type RouteContext = any

export function createPackageRoutes(services: {
  db: AppDatabase
  config: AppConfig
  packageRegistry?: PackageRegistry
}) {
  const { db, config, packageRegistry } = services
  const catalog = createPackageCatalog({
    registry: packageRegistry,
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

        const packages = await listRegistryPackagesForUser(db, user.id, catalog)
        return ok({
          schemaVersion: catalog.registry.schemaVersion,
          updatedAt: catalog.registry.updatedAt,
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
      "/installed",
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
        })

        if (!user) {
          return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
        }

        const pkg = catalog.getPackageById(params.packageId)
        if (!pkg) {
          return fail(set, 404, "PACKAGE_NOT_FOUND", "Package not found.")
        }

        const result = await installPackageForUser(db, user.id, pkg)
        if (!result) {
          const existing = await getInstalledPackageForUser(db, user.id, pkg.id)
          return fail(set, 409, "PACKAGE_ALREADY_INSTALLED", "Package is already installed.", {
            installation: existing,
          })
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
        })

        if (!user) {
          return fail(set, 401, "UNAUTHORIZED", "Authentication is required.")
        }

        const pkg = catalog.getPackageById(params.packageId)
        if (!pkg) {
          return fail(set, 404, "PACKAGE_NOT_FOUND", "Package not found.")
        }

        const result = await updateInstalledPackageForUser(db, user.id, pkg)
        if (!result) {
          return fail(set, 404, "PACKAGE_NOT_INSTALLED", "Package is not installed yet.")
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
