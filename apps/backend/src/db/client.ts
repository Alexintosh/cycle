import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { createClient, type Client } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import * as schema from "./schema.ts"

import type { BatchItem } from "drizzle-orm/batch"

import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core"

export type AppDatabase = BaseSQLiteDatabase<"async", unknown, typeof schema> & {
  batch(queries: readonly [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]): Promise<unknown>
}

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
