import type { BatchItem } from "drizzle-orm/batch"
import type { AppDatabase } from "./client.ts"

export async function runBatch(db: AppDatabase, queries: BatchItem<"sqlite">[]) {
  if (!queries.length) return
  return db.batch(queries as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]])
}
