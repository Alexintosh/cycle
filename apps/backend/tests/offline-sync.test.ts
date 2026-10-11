import { describe, expect, it } from "bun:test"
import { createTestServer } from "./helpers.ts"
import { habitLogs, users, habits } from "../src/db/schema.ts"
import { eq } from "drizzle-orm"

describe("offline check-in replay", () => {
  it("deduplicates concurrent deliveries, preserves toggle ordering, and isolates accounts", async () => {
    const { app, db, client } = await createTestServer()
    const now = new Date()
    for (const id of ['alice','bob']) await db.insert(users).values({id,email:id+'@example.com',displayName:id,createdAt:now,updatedAt:now})
    await db.insert(habits).values({id:'h',userId:'alice',name:'Read',frequency:'daily',createdAt:now,updatedAt:now})
    const tokens = app.decorator.sessions
    const alice = await tokens.issue('alice'), bob = await tokens.issue('bob')
    const call = (body: any, token = alice.token) => app.handle(new Request('http://localhost/habits/sync',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body)}))
    const add = {id:crypto.randomUUID(),habitId:'h',kind:'add-log',date:'2026-10-11',loggedAt:now.toISOString(),count:3}
    const responses = await Promise.all([call(add),call(add)])
    expect(responses.map(response => response.status)).toEqual([200,200])
    expect(await db.select().from(habitLogs)).toHaveLength(3)
    expect((await call({...add,count:4})).status).toBe(409)
    expect((await call({...add,id:crypto.randomUUID()},bob.token)).status).toBe(404)
    const off = {id:crypto.randomUUID(),habitId:'h',kind:'set-day',date:'2026-10-11',completed:false,loggedAt:now.toISOString()}
    expect((await call(off)).status).toBe(200)
    expect(await db.select().from(habitLogs)).toHaveLength(0)
    const on = {...off,id:crypto.randomUUID(),completed:true}
    expect((await call(on)).status).toBe(200)
    expect((await call(off)).status).toBe(200)
    expect((await db.select().from(habitLogs).where(eq(habitLogs.habitId,'h')))).toHaveLength(1)
    expect((await call({...add,id:crypto.randomUUID(),date:'invalid'})).status).toBe(400)
    client.close()
  })
})
