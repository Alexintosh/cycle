import type { AppConfig } from "../config.ts"

export function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString()
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

export async function sendOtpEmail(config: AppConfig, email: string, code: string) {
  const isProduction = config.env === "production"

  if (!isProduction || !config.emailServiceApiKey) {
    console.log("═══════════════════════════════════════════")
    console.log(`📧 OTP Email: ${email}`)
    console.log(`🔐 Code: ${code}`)
    console.log("═══════════════════════════════════════════")
    return
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.emailServiceApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email }] }],
      from: {
        email: config.emailFrom,
        name: "Cycle",
      },
      subject: "Your verification code",
      content: [
        {
          type: "text/plain",
          value: `Your verification code is ${code}. It expires in 10 minutes.`,
        },
        {
          type: "text/html",
          value: renderOtpEmail(code),
        },
      ],
    }),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Failed to send OTP email: ${message}`)
  }
}
