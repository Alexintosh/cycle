import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
    lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
  },
  (table) => ({
    emailIndex: uniqueIndex("users_email_unique").on(table.email),
  }),
)

export const oneTimePasswords = sqliteTable(
  "one_time_passwords",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    code: text("code").notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    emailIndex: index("otp_email_idx").on(table.email),
    createdAtIndex: index("otp_created_at_idx").on(table.createdAt),
  }),
)

export const passkeys = sqliteTable(
  "passkeys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    webauthnUserId: text("webauthn_user_id").notNull(),
    name: text("name").notNull(),
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    transports: text("transports").notNull().default("[]"),
    deviceType: text("device_type").notNull(),
    backedUp: integer("backed_up", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  },
  (table) => ({
    userIndex: index("passkeys_user_idx").on(table.userId),
    webauthnUserIndex: index("passkeys_webauthn_user_idx").on(table.webauthnUserId),
  }),
)

export const webauthnChallenges = sqliteTable(
  "webauthn_challenges",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    challenge: text("challenge").notNull(),
    webauthnUserId: text("webauthn_user_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    purposeIndex: index("webauthn_challenges_purpose_idx").on(table.purpose),
    expiresAtIndex: index("webauthn_challenges_expires_at_idx").on(table.expiresAt),
    userPurposeIndex: index("webauthn_challenges_user_purpose_idx").on(table.userId, table.purpose),
  }),
)

export const habits = sqliteTable(
  "habits",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull().default("OTHER"),
    frequency: text("frequency").notNull(),
    goal: integer("goal"),
    color: text("color").notNull().default("#FECACA"),
    emoji: text("emoji").default("✨"),
    sourceType: text("source_type").notNull().default("manual"),
    packageId: text("package_id"),
    packageItemId: text("package_item_id"),
    order: integer("order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    userIndex: index("habits_user_idx").on(table.userId),
    orderIndex: index("habits_user_order_idx").on(table.userId, table.order),
    packageIndex: index("habits_user_package_idx").on(table.userId, table.packageId),
    packageItemIndex: uniqueIndex("habits_user_package_item_unique").on(table.userId, table.packageId, table.packageItemId),
  }),
)

export const installedPackages = sqliteTable(
  "installed_packages",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    packageId: text("package_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    author: text("author").notNull(),
    installedVersion: text("installed_version").notNull(),
    installedAt: integer("installed_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    userIndex: index("installed_packages_user_idx").on(table.userId),
    packageIndex: uniqueIndex("installed_packages_user_package_unique").on(table.userId, table.packageId),
  }),
)

export const habitLogs = sqliteTable(
  "habit_logs",
  {
    id: text("id").primaryKey(),
    habitId: text("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    logDate: text("log_date").notNull(),
    loggedAt: integer("logged_at", { mode: "timestamp" }).notNull(),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    habitIndex: index("habit_logs_habit_idx").on(table.habitId),
    dateIndex: index("habit_logs_habit_date_idx").on(table.habitId, table.logDate),
  }),
)

export type UserRecord = typeof users.$inferSelect
export type HabitRecord = typeof habits.$inferSelect
export type HabitLogRecord = typeof habitLogs.$inferSelect
export type OtpRecord = typeof oneTimePasswords.$inferSelect
export type InstalledPackageRecord = typeof installedPackages.$inferSelect
export type PasskeyRecord = typeof passkeys.$inferSelect
export type WebAuthnChallengeRecord = typeof webauthnChallenges.$inferSelect
