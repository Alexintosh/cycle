import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach } from "bun:test"
import { createApp } from "../src/app.ts"

const cleanupPaths: string[] = []

afterEach(() => {
  while (cleanupPaths.length) {
    const path = cleanupPaths.pop()
    if (path) {
      rmSync(path, { recursive: true, force: true })
    }
  }
})

export async function createTestServer() {
  const tempDir = mkdtempSync(join(tmpdir(), "habit-backend-"))
  cleanupPaths.push(tempDir)

  const databaseUrl = `file:${join(tempDir, "test.db")}`
  return createApp({
    env: "test",
    databaseUrl,
    jwtSecret: "test-secret",
  })
}

export async function jsonOf(response: Response) {
  return response.json()
}
