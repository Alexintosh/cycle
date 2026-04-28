import { describe, expect, it } from "bun:test"
import { desc, eq } from "drizzle-orm"
import { oneTimePasswords, passkeys } from "../src/db/schema.ts"
import { createTestServer, jsonOf } from "./helpers.ts"

async function createAuthenticatedContext() {
  const server = await createTestServer()
  const email = "passkeys@example.com"

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
    userId: payload.data.user.id as string,
    token: payload.data.token as string,
  }
}

describe("passkeys", () => {
  it("returns passkey registration options for the authenticated user", async () => {
    const { app, client, token } = await createAuthenticatedContext()

    const response = await app.handle(
      new Request("http://localhost/auth/passkeys/register/options", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    )

    expect(response.status).toBe(200)
    const payload = await jsonOf(response)
    expect(payload.success).toBe(true)
    expect(payload.data.challengeId).toBeString()
    expect(payload.data.options.rp.name).toBe("Cycle")
    expect(payload.data.options.user.name).toBe("passkeys@example.com")

    client.close()
  })

  it("lists and deletes passkeys owned by the authenticated user", async () => {
    const { app, db, client, token, userId } = await createAuthenticatedContext()
    const createdAt = new Date()

    await db.insert(passkeys).values({
      id: "test-passkey-id",
      userId,
      webauthnUserId: "test-webauthn-user-id",
      name: "MacBook Air",
      publicKey: "ZmFrZS1wdWJsaWMta2V5",
      counter: 0,
      transports: JSON.stringify(["internal"]),
      deviceType: "multiDevice",
      backedUp: true,
      createdAt,
      lastUsedAt: null,
    })

    const listResponse = await app.handle(
      new Request("http://localhost/auth/passkeys", {
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    )

    expect(listResponse.status).toBe(200)
    const listPayload = await jsonOf(listResponse)
    expect(listPayload.data).toHaveLength(1)
    expect(listPayload.data[0].name).toBe("MacBook Air")

    const deleteResponse = await app.handle(
      new Request("http://localhost/auth/passkeys/test-passkey-id", {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    )

    expect(deleteResponse.status).toBe(200)
    const deletePayload = await jsonOf(deleteResponse)
    expect(deletePayload.data.removed).toBe(true)

    const afterDeleteResponse = await app.handle(
      new Request("http://localhost/auth/passkeys", {
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    )

    const afterDeletePayload = await jsonOf(afterDeleteResponse)
    expect(afterDeletePayload.data).toHaveLength(0)

    client.close()
  })

  it("returns usernameless passkey authentication options", async () => {
    const { app, client } = await createTestServer()

    const response = await app.handle(
      new Request("http://localhost/auth/passkeys/authenticate/options", {
        method: "POST",
      }),
    )

    expect(response.status).toBe(200)
    const payload = await jsonOf(response)
    expect(payload.success).toBe(true)
    expect(payload.data.challengeId).toBeString()
    expect(payload.data.options.challenge).toBeString()
    expect(payload.data.options.userVerification).toBe("required")

    client.close()
  })
})
