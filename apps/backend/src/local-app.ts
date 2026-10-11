import { createRuntime } from "./app.ts"
import { loadConfig, type AppConfig } from "./config.ts"
import { createDatabase } from "./db/client.ts"
import { initializeDatabase } from "./db/init.ts"
import type { PackageRegistry } from "./modules/packages/types.ts"

export async function createApp(options: Partial<AppConfig> & {
  packageRegistry?: PackageRegistry
  sendOtp?: (config: AppConfig, email: string, code: string) => Promise<void>
} = {}) {
  const config = { ...loadConfig(), ...options }
  const { client, db } = createDatabase(config.databaseUrl)
  await initializeDatabase(client)
  return { ...createRuntime(db, config, options), client }
}
