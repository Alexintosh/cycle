import { describe, expect, it } from "bun:test"
import { eq } from "drizzle-orm"
import { oneTimePasswords, sessions, habits } from "../src/db/schema.ts"
import { createTestServer, deliveredOtps, jsonOf } from "./helpers.ts"

async function login(server: Awaited<ReturnType<typeof createTestServer>>, email: string) {
  await server.app.handle(new Request("http://localhost/auth/request-otp", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }),
  }))
  const response = await server.app.handle(new Request("http://localhost/auth/verify-otp", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code: deliveredOtps.get(email) }),
  }))
  expect(response.status).toBe(200)
  return (await jsonOf(response)).data
}

function request(path: string, token: string, method = "GET", body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

describe("multi-user security", () => {
  it("isolates CRUD, logs, exports and rejects a foreign habit in imported logs", async () => {
    const server = await createTestServer()
    try {
      const alice = await login(server, "alice@example.com"), bob = await login(server, "bob@example.com")
      const snapshot = (await jsonOf(await server.app.handle(request("/data/export", alice.token)))).data
      const foreignId = snapshot.habits[0].id
      for (const method of ["GET", "DELETE"]) {
        expect((await server.app.handle(request(`/habits/${foreignId}`, bob.token, method))).status).toBe(404)
      }
      expect((await server.app.handle(request(`/habits/${foreignId}/logs`, bob.token, "POST", {}))).status).toBe(404)
      const bobSnapshot = (await jsonOf(await server.app.handle(request("/data/export", bob.token)))).data
      expect(bobSnapshot.habits.some((habit: any) => habit.id === foreignId)).toBe(false)
      const invalid = { ...bobSnapshot, logs: [{
        id: "injected", habitId: foreignId, logDate: "2026-10-11", loggedAt: new Date().toISOString(),
      }] }
      expect((await server.app.handle(request("/data/import", bob.token, "POST", invalid))).status).toBe(400)
      const after = (await jsonOf(await server.app.handle(request("/data/export", bob.token)))).data
      expect(after.habits).toEqual(bobSnapshot.habits)
    } finally { server.client.close() }
  })

  it("remaps imported IDs and rolls back a conflicting replacement", async () => {
    const server = await createTestServer()
    try {
      const alice = await login(server, "import-alice@example.com"), bob = await login(server, "import-bob@example.com")
      const snapshot = (await jsonOf(await server.app.handle(request("/data/export", alice.token)))).data
      const imported = await server.app.handle(request("/data/import", bob.token, "POST", snapshot))
      expect(imported.status).toBe(200)
      const own = (await jsonOf(await server.app.handle(request("/data/export", bob.token)))).data
      expect(own.habits[0].id).not.toBe(snapshot.habits[0].id)
      expect(own.habits.length).toBe(snapshot.habits.length)
      const pkg = { id: "same", packageId: "duplicate", title: "test", author: "test", installedVersion: "1", installedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      const conflict = { ...own, packages: [pkg, pkg] }
      expect((await server.app.handle(request("/data/import", bob.token, "POST", conflict))).status).toBe(400)
      const after = (await jsonOf(await server.app.handle(request("/data/export", bob.token)))).data
      expect(after.habits).toEqual(own.habits)
    } finally { server.client.close() }
  })

  it("rotates refresh tokens, rejects refresh as access, and revokes both tokens on logout", async () => {
    const server = await createTestServer()
    try {
      const session = await login(server, "sessions@example.com")
      const stored = await server.db.select().from(sessions)
      expect(stored[0]!.accessHash).not.toBe(session.token)
      expect((await server.app.handle(request("/auth/me", session.refreshToken))).status).toBe(401)
      const refresh = () => server.app.handle(request("/auth/refresh", "", "POST", { refreshToken: session.refreshToken }))
      const results = await Promise.all([refresh(), refresh()])
      expect(results.map((response) => response.status).sort()).toEqual([200, 401])
      const next = (await jsonOf(results.find((response) => response.status === 200)!)).data
      expect((await server.app.handle(request("/auth/me", session.token))).status).toBe(401)
      expect((await server.app.handle(request("/auth/logout", next.token, "POST"))).status).toBe(200)
      expect((await server.app.handle(request("/auth/me", next.token))).status).toBe(401)
      expect((await server.app.handle(request("/auth/refresh", "", "POST", { refreshToken: next.refreshToken }))).status).toBe(401)
    } finally { server.client.close() }
  })

  it("protects OTPs at rest, consumes once, rate-limits and preserves customized habits on login", async () => {
    const server = await createTestServer()
    try {
      const email = "otp@example.com"
      const session = await login(server, email)
      const [otp] = await server.db.select().from(oneTimePasswords).where(eq(oneTimePasswords.email, email))
      expect(otp!.code).not.toBe(deliveredOtps.get(email))
      expect(otp!.code).toHaveLength(64)
      expect((await server.app.handle(request("/auth/verify-otp", "", "POST", { email, code: deliveredOtps.get(email) }))).status).toBe(400)
      const [habit] = await server.db.select().from(habits).where(eq(habits.userId, session.user.id))
      await server.db.update(habits).set({ description: "customized", goal: 42 }).where(eq(habits.id, habit!.id))
      await server.app.handle(request("/auth/me", session.token))
      const [after] = await server.db.select().from(habits).where(eq(habits.id, habit!.id))
      expect(after!.description).toBe("customized")
      expect(after!.goal).toBe(42)
      const requests = await Promise.all(Array.from({ length: 4 }, () => server.app.handle(request("/auth/request-otp", "", "POST", { email }))))
      expect(requests.filter((response) => response.status === 429).length).toBeGreaterThanOrEqual(2)
    } finally { server.client.close() }
  })
})
