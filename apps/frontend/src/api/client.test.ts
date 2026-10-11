import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiClient } from "./client"

afterEach(() => vi.unstubAllGlobals())

describe("API request bodies", () => {
  it("does not declare JSON for bodyless passkey and account requests", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => Response.json({ success: true, data: {} }))
    vi.stubGlobal("fetch", fetchMock)
    const api = new ApiClient()
    await api.beginPasskeyAuthentication()
    await api.beginPasskeyRegistration()
    await api.regenerateRecoveryCodes()
    await api.logout()
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.method).toBe("POST")
      expect(init.body).toBeUndefined()
      expect(init.headers.has("Content-Type")).toBe(false)
    }
  })

  it("declares JSON when sending a registration payload", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => Response.json({ success: true, data: {} }))
    vi.stubGlobal("fetch", fetchMock)
    await new ApiClient().beginEnrollment("owner@example.com")
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers.get("Content-Type")).toBe("application/json")
    expect(JSON.parse(init.body)).toEqual({ email: "owner@example.com" })
  })
})
