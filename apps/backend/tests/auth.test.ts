import { describe, expect, it } from "bun:test"
import { desc, eq } from "drizzle-orm"
import { oneTimePasswords } from "../src/db/schema.ts"
import { starterHabits } from "../src/db/seed.ts"
import { createTestServer, jsonOf } from "./helpers.ts"

async function createAuthenticatedContext() {
  const server = await createTestServer()
  const email = "habit-seed@example.com"

  await server.app.handle(
    new Request("http://localhost/auth/request-otp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ email }),
    }),
  )

  const [otp] = await server.db
    .select()
    .from(oneTimePasswords)
    .where(eq(oneTimePasswords.email, email))
    .orderBy(desc(oneTimePasswords.createdAt))
    .limit(1)

  const verifyResponse = await server.app.handle(
    new Request("http://localhost/auth/verify-otp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, code: otp!.code }),
    }),
  )

  const payload = await jsonOf(verifyResponse)
  return {
    ...server,
    token: payload.data.token as string,
  }
}

describe("auth", () => {
  it("requests and verifies OTP, then returns the current user", async () => {
    const { app, db, client } = await createTestServer()

    const email = "alex@example.com"
    const requestOtpResponse = await app.handle(
      new Request("http://localhost/auth/request-otp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ email }),
      }),
    )

    expect(requestOtpResponse.status).toBe(200)
    const otpPayload = await jsonOf(requestOtpResponse)
    expect(otpPayload.success).toBe(true)
    expect(otpPayload.data.email).toBe(email)

    const [otp] = await db.select().from(oneTimePasswords).where(eq(oneTimePasswords.email, email)).orderBy(desc(oneTimePasswords.createdAt)).limit(1)
    expect(otp?.code).toBeString()

    const verifyResponse = await app.handle(
      new Request("http://localhost/auth/verify-otp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ email, code: otp!.code, displayName: "Alex" }),
      }),
    )

    expect(verifyResponse.status).toBe(200)
    const verifyPayload = await jsonOf(verifyResponse)
    expect(verifyPayload.success).toBe(true)
    expect(verifyPayload.data.user.email).toBe(email)
    expect(verifyPayload.data.user.displayName).toBe("Alex")

    const meResponse = await app.handle(
      new Request("http://localhost/auth/me", {
        headers: {
          authorization: `Bearer ${verifyPayload.data.token}`,
        },
      }),
    )

    expect(meResponse.status).toBe(200)
    const mePayload = await jsonOf(meResponse)
    expect(mePayload.data.email).toBe(email)

    client.close()
  })

  it("rejects invalid OTP attempts and tracks remaining attempts", async () => {
    const { app, client } = await createTestServer()

    await app.handle(
      new Request("http://localhost/auth/request-otp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ email: "wrong@example.com" }),
      }),
    )

    const verifyResponse = await app.handle(
      new Request("http://localhost/auth/verify-otp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ email: "wrong@example.com", code: "000000" }),
      }),
    )

    expect(verifyResponse.status).toBe(400)
    const payload = await jsonOf(verifyResponse)
    expect(payload.success).toBe(false)
    expect(payload.error.code).toBe("INVALID_CODE")
    expect(payload.error.attemptsRemaining).toBe(4)

    client.close()
  })

  it("seeds starter habits for a new account", async () => {
    const { app, client, token } = await createAuthenticatedContext()

    const listResponse = await app.handle(
      new Request("http://localhost/habits?includeLogs=true", {
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    )

    expect(listResponse.status).toBe(200)
    const payload = await jsonOf(listResponse)
    expect(payload.data).toHaveLength(starterHabits.length)
    expect(payload.data.map((habit: { name: string }) => habit.name)).toContain("Meditation")
    expect(payload.data.map((habit: { name: string }) => habit.name)).toContain("Finger Stretch")

    client.close()
  })
})
