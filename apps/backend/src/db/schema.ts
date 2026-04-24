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
    order: integer("order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    userIndex: index("habits_user_idx").on(table.userId),
    orderIndex: index("habits_user_order_idx").on(table.userId, table.order),
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
