export type AppConfig = {
  env: "development" | "test" | "production"
  port: number
  databaseUrl: string
  jwtSecret: string
  frontendUrl: string
  authBypassEnabled: boolean
  authBypassEmail: string
  authBypassDisplayName: string
  webauthnRpName: string
  webauthnRpId: string
  webauthnOrigins: string[]
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

function readBoolean(value: string | undefined, fallback: boolean) {
  if (value == null) {
    return fallback
  }

  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true
    case "0":
    case "false":
    case "no":
    case "off":
      return false
    default:
      return fallback
  }
}

function readList(value: string | undefined, fallback: string[]) {
  const items = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean)

  return items && items.length > 0 ? items : fallback
}

function readHostname(url: string, fallback: string) {
  try {
    return new URL(url).hostname
  } catch {
    return fallback
  }
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const frontendUrl = env.FRONTEND_URL || "http://localhost:3100"

  return {
    env: (env.NODE_ENV as AppConfig["env"]) || "development",
    port: readNumber(env.PORT, 3101),
    databaseUrl: env.DATABASE_URL || "file:./data/habit-tracker.db",
    jwtSecret: env.JWT_SECRET || "dev-secret-change-in-production",
    frontendUrl,
    authBypassEnabled: readBoolean(env.AUTH_BYPASS_ENABLED, false),
    authBypassEmail: env.AUTH_BYPASS_EMAIL || "internal@cycle.local",
    authBypassDisplayName: env.AUTH_BYPASS_DISPLAY_NAME || "Internal User",
    webauthnRpName: env.WEBAUTHN_RP_NAME || "Cycle",
    webauthnRpId: env.WEBAUTHN_RP_ID || readHostname(frontendUrl, "localhost"),
    webauthnOrigins: readList(env.WEBAUTHN_ORIGINS ?? env.WEBAUTHN_ORIGIN, [frontendUrl]),
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
