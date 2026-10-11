import type { AppConfig } from "../config.ts"

export function generateOtp() {
  const values = new Uint32Array(1)
  do { crypto.getRandomValues(values) } while (values[0]! >= 4294800000)
  return (100000 + values[0]! % 900000).toString()
}

function renderOtpEmail(code: string) {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h1 style="margin-bottom: 12px;">Your Cycle verification code</h1>
      <p style="margin-bottom: 20px;">Use the code below to sign in.</p>
      <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; padding: 16px; background: #f3f4f6; border-radius: 12px; width: fit-content;">
        ${code}
      </div>
      <p style="margin-top: 20px;">This code expires in 10 minutes.</p>
    </div>
  `
}

export function createOtpEmail(config: AppConfig, email: string, code: string): EmailMessageBuilder {
  const minutes = config.otpExpiryMinutes
  return {
    to: email,
    from: { email: config.emailFrom, name: "Cycle" },
    subject: "Your Cycle verification code",
    text: `Your verification code is ${code}. It expires in ${minutes} minutes.`,
    html: renderOtpEmail(code).replace("expires in 10 minutes", `expires in ${minutes} minutes`),
  }
}

export async function sendOtpEmail(_config: AppConfig, _email: string, _code: string): Promise<void> {
  throw new Error("Email delivery requires the Cloudflare EMAIL binding. Run the Cloudflare Worker for email login.")
}

export async function hashOtp(config: AppConfig, email: string, code: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(config.jwtSecret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${email}:${code}`))
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("")
}
