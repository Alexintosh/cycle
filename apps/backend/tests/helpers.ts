import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach } from "bun:test"
import { createApp } from "../src/app.ts"
import type { AppConfig } from "../src/config.ts"
import type { PackageRegistry } from "../src/modules/packages/types.ts"

const cleanupPaths: string[] = []
const cleanupEnvSnapshots: Array<Record<string, string | undefined>> = []

afterEach(() => {
  while (cleanupPaths.length) {
    const path = cleanupPaths.pop()
    if (path) {
      rmSync(path, { recursive: true, force: true })
    }
  }

  while (cleanupEnvSnapshots.length) {
    const snapshot = cleanupEnvSnapshots.pop()
    if (!snapshot) {
      continue
    }

    for (const [key, value] of Object.entries(snapshot)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
})

export async function createTestServer(
  options: {
    databaseUrl?: string
    packageRegistry?: PackageRegistry
    configOverrides?: Partial<AppConfig>
  } = {},
) {
  let tempDir = ""
  if (!options.databaseUrl) {
    tempDir = mkdtempSync(join(tmpdir(), "habit-backend-"))
    cleanupPaths.push(tempDir)
  }

  const databaseUrl = options.databaseUrl ?? `file:${join(tempDir, "test.db")}`

  const envSnapshot: Record<string, string | undefined> = {}
  const setEnv = (key: string, value?: string) => {
    envSnapshot[key] = process.env[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  setEnv(
    "AUTH_BYPASS_ENABLED",
    options.configOverrides?.authBypassEnabled !== undefined ? String(options.configOverrides.authBypassEnabled) : undefined,
  )
  setEnv("AUTH_BYPASS_EMAIL", options.configOverrides?.authBypassEmail)
  setEnv("AUTH_BYPASS_DISPLAY_NAME", options.configOverrides?.authBypassDisplayName)

  if (Object.keys(envSnapshot).length > 0) {
    cleanupEnvSnapshots.push(envSnapshot)
  }

  return createApp({
    env: "test",
    databaseUrl,
    jwtSecret: "test-secret",
    packageRegistry: options.packageRegistry,
    ...options.configOverrides,
  })
}

export async function jsonOf(response: Response) {
  return response.json()
}
