import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { createClient, type Client } from "@libsql/client"
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql"
import * as schema from "./schema.ts"

export type AppDatabase = LibSQLDatabase<typeof schema>

function resolveLocalDatabasePath(databaseUrl: string) {
  if (!databaseUrl.startsWith("file:")) {
    return null
  }

  const rawPath = databaseUrl.slice("file:".length)
  return rawPath.startsWith("/") ? rawPath : resolve(process.cwd(), rawPath)
}

export function createDatabase(databaseUrl: string): { client: Client; db: AppDatabase } {
  const localPath = resolveLocalDatabasePath(databaseUrl)
  if (localPath) {
    mkdirSync(dirname(localPath), { recursive: true })
  }

  const client = createClient({
    url: databaseUrl,
  })

  return {
    client,
    db: drizzle(client, { schema }),
  }
}
