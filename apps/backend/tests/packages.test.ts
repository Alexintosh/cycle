import { describe, expect, it } from "bun:test"
import { desc, eq } from "drizzle-orm"
import { oneTimePasswords } from "../src/db/schema.ts"
import { compareVersions, getVersionStatus } from "../src/modules/packages/helpers.ts"
import { createPackageCatalog } from "../src/modules/packages/service.ts"
import type { PackageRegistry } from "../src/modules/packages/types.ts"
import { createTestServer, jsonOf } from "./helpers.ts"

async function createAuthenticatedContext(options: { databaseUrl?: string; packageRegistry?: PackageRegistry } = {}) {
  const server = await createTestServer(options)
  const email = "packages@example.com"

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
})
