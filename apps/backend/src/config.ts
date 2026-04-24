export type AppConfig = {
  env: "development" | "test" | "production"
  port: number
  databaseUrl: string
  jwtSecret: string
  frontendUrl: string
  accessTokenTtl: string
  refreshTokenTtl: string
  otpExpiryMinutes: number
  otpMaxAttempts: number
  otpRequestLimit: number
  otpRequestWindowMinutes: number
  emailServiceApiKey?: string
  emailFrom: string
}

function readNumber(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  return {
    env: (env.NODE_ENV as AppConfig["env"]) || "development",
    port: readNumber(env.PORT, 3101),
    databaseUrl: env.DATABASE_URL || "file:./data/habit-tracker.db",
    jwtSecret: env.JWT_SECRET || "dev-secret-change-in-production",
    frontendUrl: env.FRONTEND_URL || "http://127.0.0.1:3100",
    accessTokenTtl: env.ACCESS_TOKEN_TTL || "7d",
    refreshTokenTtl: env.REFRESH_TOKEN_TTL || "30d",
    otpExpiryMinutes: readNumber(env.OTP_EXPIRY_MINUTES, 10),
    otpMaxAttempts: readNumber(env.OTP_MAX_ATTEMPTS, 5),
    otpRequestLimit: readNumber(env.OTP_REQUEST_LIMIT, 3),
    otpRequestWindowMinutes: readNumber(env.OTP_REQUEST_WINDOW_MINUTES, 10),
    emailServiceApiKey: env.EMAIL_SERVICE_API_KEY,
    emailFrom: env.EMAIL_FROM || "noreply@example.com",
  }
}
