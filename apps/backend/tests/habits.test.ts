import { describe, expect, it } from "bun:test"
import { desc, eq } from "drizzle-orm"
import { oneTimePasswords } from "../src/db/schema.ts"
import { starterHabits } from "../src/db/seed.ts"
import { createTestServer, jsonOf } from "./helpers.ts"

async function createAuthenticatedContext() {
  const server = await createTestServer()
  const email = "habit@example.com"

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

describe("habits", () => {
  it("creates habits, supports multiple logs per day, and exports data", async () => {
    const { app, client, token } = await createAuthenticatedContext()

    const createHabitResponse = await app.handle(
      new Request("http://localhost/habits", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: "Morning walk",
          description: "Walk outside",
          category: "HEALTH",
          frequency: "daily",
          goal: null,
          color: "#D9F99D",
          emoji: "🚶",
        }),
      }),
    )

    expect(createHabitResponse.status).toBe(200)
    const createdHabit = await jsonOf(createHabitResponse)
    const habitId = createdHabit.data.id as string

    const createLogsResponse = await app.handle(
      new Request(`http://localhost/habits/${habitId}/logs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          date: "2026-04-23",
          count: 2,
        }),
      }),
    )

    expect(createLogsResponse.status).toBe(200)
    const logPayload = await jsonOf(createLogsResponse)
    expect(logPayload.data.logs).toHaveLength(2)
    expect(logPayload.data.achieved).toBe(2)

    const listResponse = await app.handle(
      new Request("http://localhost/habits?startDate=2026-04-01&endDate=2026-04-30&includeLogs=true", {
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    )

    expect(listResponse.status).toBe(200)
    const listPayload = await jsonOf(listResponse)
    expect(listPayload.data).toHaveLength(starterHabits.length + 1)
    const createdHabitInList = listPayload.data.find((habit: { id: string }) => habit.id === habitId)
    expect(createdHabitInList?.stats.logCount).toBe(2)

    const exportResponse = await app.handle(
      new Request("http://localhost/data/export", {
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    )

    expect(exportResponse.status).toBe(200)
    const exportPayload = await jsonOf(exportResponse)
    expect(exportPayload.data.habits).toHaveLength(starterHabits.length + 1)
    expect(exportPayload.data.logs).toHaveLength(2)

    client.close()
  })

  it("reorders habits and supports single-day compatibility toggles", async () => {
    const { app, client, token } = await createAuthenticatedContext()

    const createHabit = async (name: string) => {
      const response = await app.handle(
        new Request("http://localhost/habits", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name,
            category: "OTHER",
            frequency: "weekly",
            goal: 3,
            color: "#BAE6FD",
          }),
        }),
      )

      return jsonOf(response)
    }

    const first = await createHabit("Read")
    const second = await createHabit("Stretch")

    const reorderResponse = await app.handle(
      new Request("http://localhost/habits/reorder", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: [
            { id: second.data.id, order: 0, category: "FITNESS" },
            { id: first.data.id, order: 1, category: "OTHER" },
          ],
        }),
      }),
    )

    expect(reorderResponse.status).toBe(200)

    const toggleOnResponse = await app.handle(
      new Request(`http://localhost/habits/${second.data.id}/day-status`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          date: "2026-04-23",
          completed: true,
        }),
      }),
    )

    expect(toggleOnResponse.status).toBe(200)
    const toggledOn = await jsonOf(toggleOnResponse)
    expect(toggledOn.data.logs).toHaveLength(1)

    const toggleOffResponse = await app.handle(
      new Request(`http://localhost/habits/${second.data.id}/day-status`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          date: "2026-04-23",
          completed: false,
        }),
      }),
    )

    expect(toggleOffResponse.status).toBe(200)
    const toggledOff = await jsonOf(toggleOffResponse)
    expect(toggledOff.data.logs).toHaveLength(0)

    const categoriesResponse = await app.handle(
      new Request("http://localhost/categories", {
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    )

    const categoriesPayload = await jsonOf(categoriesResponse)
    expect(categoriesPayload.data.some((row: { category: string }) => row.category === "FITNESS")).toBe(true)

    client.close()
  })
})
