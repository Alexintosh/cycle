import type { AuthenticatorTransportFuture, CredentialDeviceType } from "@simplewebauthn/server"
import type { AppConfig } from "../../config.ts"
import type { PasskeyRecord } from "../../db/schema.ts"

const textEncoder = new TextEncoder()
const validTransports = new Set<AuthenticatorTransportFuture>(["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"])

export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60_000
export const SUPPORTED_WEBAUTHN_ALGORITHMS = [-7, -257] as const

export type PasskeySummary = {
  id: string
  name: string
  deviceType: CredentialDeviceType
  backedUp: boolean
  transports: AuthenticatorTransportFuture[]
  createdAt: string
  lastUsedAt: string | null
}

export function encodeUserId(userId: string) {
  return textEncoder.encode(userId)
}

export function toBase64Url(bytes: Uint8Array) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

export function fromBase64Url(value: string) {
  const padding = (4 - (value.length % 4)) % 4
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padding)
  return new Uint8Array(Buffer.from(base64, "base64"))
}

export function serializeTransports(transports?: AuthenticatorTransportFuture[]) {
  return JSON.stringify(transports ?? [])
}

export function parseTransports(value?: string | null) {
  if (!value) {
    return [] as AuthenticatorTransportFuture[]
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return [] as AuthenticatorTransportFuture[]
    }

    return parsed.filter((item): item is AuthenticatorTransportFuture => typeof item === "string" && validTransports.has(item as AuthenticatorTransportFuture))
  } catch {
    return [] as AuthenticatorTransportFuture[]
  }
}

export function formatPasskeyName(name: string | undefined, createdAt: Date) {
  const trimmed = name?.trim()
  if (trimmed) {
    return trimmed
  }

  return `Passkey ${createdAt.toISOString().slice(0, 10)}`
}

export function toPasskeySummary(passkey: PasskeyRecord): PasskeySummary {
  return {
    id: passkey.id,
    name: passkey.name,
    deviceType: passkey.deviceType as CredentialDeviceType,
    backedUp: Boolean(passkey.backedUp),
    transports: parseTransports(passkey.transports),
    createdAt: passkey.createdAt.toISOString(),
    lastUsedAt: passkey.lastUsedAt?.toISOString() ?? null,
  }
}

export function getExpectedOrigins(config: AppConfig) {
  return config.webauthnOrigins
}

export function getExpectedRpId(config: AppConfig) {
  return config.webauthnRpId
}
