import { describe, expect, it } from "bun:test"
import { desc, eq } from "drizzle-orm"
import { oneTimePasswords } from "../src/db/schema.ts"
import { compareVersions, getVersionStatus } from "../src/modules/packages/helpers.ts"
import { createPackageCatalog } from "../src/modules/packages/service.ts"
import type { PackageRegistry } from "../src/modules/packages/types.ts"
import { createTestServer, jsonOf } from "./helpers.ts"

async function createAuthenticatedContext(
  options: { databaseUrl?: string; packageRegistry?: PackageRegistry; email?: string } = {},
) {
  const server = await createTestServer(options)
  const email = options.email ?? "packages@example.com"

  await server.app.handle(
    new Request("http://localhost/auth/request-otp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ email }),
    }),
  )

  const [otp] = await server.db
    .select()
    .from(oneTimePasswords)
    .where(eq(oneTimePasswords.email, email))
    .orderBy(desc(oneTimePasswords.createdAt))
    .limit(1)

  const verifyResponse = await server.app.handle(
    new Request("http://localhost/auth/verify-otp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, code: otp!.code }),
    }),
  )

  const payload = await jsonOf(verifyResponse)
  return {
    ...server,
    token: payload.data.token as string,
  }
}

describe("packages", () => {
  it("loads the registry and compares package versions", () => {
    const catalog = createPackageCatalog()

    expect(catalog.registry.schemaVersion).toBe(1)
    expect(catalog.listPackages().length).toBeGreaterThan(0)
    expect(catalog.getPackageById("cycle.house.deep-clean")?.items.length).toBeGreaterThan(0)
    expect(compareVersions("1.2.0", "1.1.9")).toBe(1)
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0)
    expect(getVersionStatus("0.9.0", "1.0.0")).toBe("update-available")
    expect(getVersionStatus(undefined, "1.0.0")).toBe("not-installed")
  })

  it("installs, updates, lists, and removes packages", async () => {
    const initialRegistry: PackageRegistry = {
      schemaVersion: 1,
      updatedAt: "2026-04-24T00:00:00.000Z",
      packages: [
        {
          id: "cycle.test.household",
          title: "Household Reset",
          description: "A test package.",
          author: "Cycle",
          version: "1.0.0",
          tags: ["home"],
          items: [
            {
              id: "filter",
              timeframe: "monthly",
              emoji: "🌀",
              title: "Change air filter",
              description: "Swap the HVAC filter.",
              goal: 1,
              section: "UPKEEP",
              color: "#E2E8F0",
            },
          ],
        },
      ],
    }

    const { app, client, token, config } = await createAuthenticatedContext({
      packageRegistry: initialRegistry,
    })

    const installResponse = await app.handle(
      new Request("http://localhost/packages/cycle.test.household/install", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    )

    expect(installResponse.status).toBe(200)
    const installPayload = await jsonOf(installResponse)
    expect(installPayload.data.addedHabits).toBe(1)

    const registryResponse = await app.handle(
      new Request("http://localhost/packages/registry", {
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    )

    const registryPayload = await jsonOf(registryResponse)
    expect(registryPayload.data.packages[0].installation.installedVersion).toBe("1.0.0")
    expect(registryPayload.data.packages[0].hasUpdate).toBe(false)

    const exportResponse = await app.handle(
      new Request("http://localhost/data/export", {
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    )

    const exportPayload = await jsonOf(exportResponse)
    expect(exportPayload.data.packages).toHaveLength(1)
    expect(exportPayload.data.habits.some((habit: { packageId?: string | null }) => habit.packageId === "cycle.test.household")).toBe(
      true,
    )

    client.close()

    const updatedRegistry: PackageRegistry = {
      ...initialRegistry,
      updatedAt: "2026-04-25T00:00:00.000Z",
      packages: [
        {
          ...initialRegistry.packages[0],
          version: "1.1.0",
          description: "A refreshed test package.",
          items: [
            {
              ...initialRegistry.packages[0].items[0],
              title: "Replace air filter",
              description: "Swap the HVAC filter and note the date.",
            },
            {
              id: "drain",
              timeframe: "quarterly",
              emoji: "🚿",
              title: "Flush hot water tap",
              description: "Run hot water briefly to avoid stale smell in the guest bathroom.",
              goal: 1,
              section: "UPKEEP",
              color: "#E2E8F0",
            },
          ],
        },
      ],
    }

    const reopened = await createTestServer({
      databaseUrl: config.databaseUrl,
      packageRegistry: updatedRegistry,
    })

    const updateResponse = await reopened.app.handle(
      new Request("http://localhost/packages/cycle.test.household/update", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    )

    expect(updateResponse.status).toBe(200)
    const updatePayload = await jsonOf(updateResponse)
    expect(updatePayload.data.previousVersion).toBe("1.0.0")
    expect(updatePayload.data.currentVersion).toBe("1.1.0")
    expect(updatePayload.data.updatedHabits).toBe(1)
    expect(updatePayload.data.addedHabits).toBe(1)

    const installedResponse = await reopened.app.handle(
      new Request("http://localhost/packages/installed", {
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    )

    const installedPayload = await jsonOf(installedResponse)
    expect(installedPayload.data[0].habitCount).toBe(2)
    expect(installedPayload.data[0].installedVersion).toBe("1.1.0")

    const removeResponse = await reopened.app.handle(
      new Request("http://localhost/packages/cycle.test.household", {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    )

    expect(removeResponse.status).toBe(200)
    const removePayload = await jsonOf(removeResponse)
    expect(removePayload.data.deletedHabits).toBe(2)

    reopened.client.close()
  })

  it("creates, updates, and publishes owned packages to the public registry", async () => {
    const emptyRegistry: PackageRegistry = {
      schemaVersion: 1,
      updatedAt: "2026-04-24T00:00:00.000Z",
      packages: [],
    }

    const owner = await createAuthenticatedContext({
      packageRegistry: emptyRegistry,
      email: "author@example.com",
    })

    const createResponse = await owner.app.handle(
      new Request("http://localhost/packages", {
        method: "POST",
        headers: {
          authorization: `Bearer ${owner.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Apartment Reset",
          description: "A package for keeping an apartment fresh.",
          version: "1.0.0",
          tags: ["home", "cleaning"],
          items: [
            {
              timeframe: "weekly",
              emoji: "🧺",
              title: "Reset laundry area",
              description: "Clear lint and reorganize detergents.",
              goal: 1,
              section: "UPKEEP",
              color: "#E2E8F0",
            },
          ],
        }),
      }),
    )

    expect(createResponse.status).toBe(200)
    const createPayload = await jsonOf(createResponse)
    expect(createPayload.data.title).toBe("Apartment Reset")
    expect(createPayload.data.author).toBe("author")
    expect(createPayload.data.itemCount).toBe(1)

    const packageId = createPayload.data.id as string

    const mineResponse = await owner.app.handle(
      new Request("http://localhost/packages/mine", {
        headers: {
          authorization: `Bearer ${owner.token}`,
        },
      }),
    )

    expect(mineResponse.status).toBe(200)
    const minePayload = await jsonOf(mineResponse)
    expect(minePayload.data).toHaveLength(1)
    expect(minePayload.data[0].id).toBe(packageId)

    const registryResponse = await owner.app.handle(
      new Request("http://localhost/packages/registry", {
        headers: {
          authorization: `Bearer ${owner.token}`,
        },
      }),
    )

    expect(registryResponse.status).toBe(200)
    const registryPayload = await jsonOf(registryResponse)
    expect(registryPayload.data.packages.some((pkg: { id: string }) => pkg.id === packageId)).toBe(true)

    const itemId = createPayload.data.items[0].id as string
    const updateResponse = await owner.app.handle(
      new Request(`http://localhost/packages/${packageId}`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${owner.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Apartment Reset",
          description: "A package for keeping an apartment fresh.",
          version: "1.1.0",
          tags: ["home", "cleaning", "reset"],
          items: [
            {
              id: itemId,
              timeframe: "weekly",
              emoji: "🧺",
              title: "Reset laundry area",
              description: "Clear lint, reorganize detergents, and wipe shelves.",
              goal: 1,
              section: "UPKEEP",
              color: "#E2E8F0",
            },
            {
              timeframe: "monthly",
              emoji: "🧽",
              title: "Wipe cabinet fronts",
              description: "Remove cooking residue from kitchen cabinets.",
              goal: 1,
              section: "UPKEEP",
              color: "#E2E8F0",
            },
          ],
        }),
      }),
    )

    expect(updateResponse.status).toBe(200)
    const updatePayload = await jsonOf(updateResponse)
    expect(updatePayload.data.version).toBe("1.1.0")
    expect(updatePayload.data.itemCount).toBe(2)

    const visitor = await createAuthenticatedContext({
      databaseUrl: owner.config.databaseUrl,
      packageRegistry: emptyRegistry,
      email: "visitor@example.com",
    })

    const publicRegistryResponse = await visitor.app.handle(
      new Request("http://localhost/packages/registry", {
        headers: {
          authorization: `Bearer ${visitor.token}`,
        },
      }),
    )

    expect(publicRegistryResponse.status).toBe(200)
    const publicRegistryPayload = await jsonOf(publicRegistryResponse)
    const publicPackage = publicRegistryPayload.data.packages.find((pkg: { id: string }) => pkg.id === packageId)
    expect(publicPackage?.version).toBe("1.1.0")
    expect(publicPackage?.itemCount).toBe(2)

    const installResponse = await visitor.app.handle(
      new Request(`http://localhost/packages/${packageId}/install`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${visitor.token}`,
        },
      }),
    )

    expect(installResponse.status).toBe(200)
    const installPayload = await jsonOf(installResponse)
    expect(installPayload.data.installation.installedVersion).toBe("1.1.0")
    expect(installPayload.data.addedHabits).toBe(2)

    visitor.client.close()
    owner.client.close()
  })
})
