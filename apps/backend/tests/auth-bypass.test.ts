import { describe, expect, it } from "bun:test"
import { jsonOf, createTestServer } from "./helpers.ts"

describe("auth bypass", () => {
  it("auto-authenticates the default user when bypass is enabled", async () => {
    const { app, client } = await createTestServer({
      configOverrides: {
        authBypassEnabled: true,
        authBypassEmail: "internal@example.com",
        authBypassDisplayName: "Internal Operator",
      },
    })

    const meResponse = await app.handle(new Request("http://localhost/auth/me"))
    expect(meResponse.status).toBe(200)

    const mePayload = await jsonOf(meResponse)
    expect(mePayload.success).toBe(true)
    expect(mePayload.data.email).toBe("internal@example.com")
    expect(mePayload.data.displayName).toBe("Internal Operator")
    expect(mePayload.data.authMode).toBe("bypass")

    const habitsResponse = await app.handle(new Request("http://localhost/habits"))
    expect(habitsResponse.status).toBe(200)

    const habitsPayload = await jsonOf(habitsResponse)
    expect(habitsPayload.success).toBe(true)
    expect(Array.isArray(habitsPayload.data)).toBe(true)

    client.close()
  })

  it("disables OTP and passkey endpoints when bypass is enabled", async () => {
    const { app, client } = await createTestServer({
      configOverrides: {
        authBypassEnabled: true,
      },
    })

    const modeResponse = await app.handle(new Request("http://localhost/auth/mode"))
    expect(modeResponse.status).toBe(200)
    const modePayload = await jsonOf(modeResponse)
    expect(modePayload.data.mode).toBe("bypass")

    const otpResponse = await app.handle(
      new Request("http://localhost/auth/request-otp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ email: "user@example.com" }),
      }),
    )
    expect(otpResponse.status).toBe(403)

    const passkeyResponse = await app.handle(
      new Request("http://localhost/auth/passkeys/authenticate/options", {
        method: "POST",
      }),
    )
    expect(passkeyResponse.status).toBe(403)

    client.close()
  })
})
