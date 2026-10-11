import "fake-indexeddb/auto"
import { deleteDB } from "idb"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiClient, type BackendHabit } from "@/api/client"
import { cacheHabits, cacheRead, readOffline, projectHabits, clearOfflineReads, enqueueCheckIn } from "./store"

const habit: BackendHabit = {
  id: "habit", name: "Read", description: "", category: "OTHER", frequency: "daily", goal: 2, color: "#fff", order: 0,
  createdAt: "2026-10-11T00:00:00Z", updatedAt: "2026-10-11T00:00:00Z", achieved: 0, logs: [],
  stats: {rangeStart:null,rangeEnd:null,logCount:0,uniqueLoggedDays:0,goal:2,isGoalMet:false,suggestedFrequencyPeriod:{start:"2026-10-11",end:"2026-10-11"}},
}
const respond = (data: unknown, status = 200) => Response.json({ success: status === 200, ...(status === 200 ? {data} : {error:{code:"UNAUTHORIZED",message:"Sign in again."}}) }, {status})
const online = (value: boolean) => vi.spyOn(navigator,"onLine","get").mockReturnValue(value)
function client(userId = "alice") {
  let tokens: { token: string; refreshToken: string } | null = { token: userId+"-token", refreshToken: "refresh" }
  let owner: string | undefined = userId
  return { api: new ApiClient({getTokens:()=>tokens,getUserId:()=>owner,setTokens:next=>{tokens=next}}), signOut:()=>{tokens=null;owner=undefined} }
}
beforeEach(async () => { await deleteDB("cycle-offline"); online(true) })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe("offline account data and check-ins", () => {
  it("opens previously saved habits for unvisited ranges and retains offline check-ins across reloads", async () => {
    await cacheHabits("alice",[habit])
    const connection = online(false)
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("offline")); vi.stubGlobal("fetch",fetchMock)
    const { api } = client()
    const completed = await api.setDayStatus("habit","2026-10-11",true)
    expect(completed.logs).toHaveLength(1)
    expect((await readOffline("alice")).pending).toHaveLength(1)
    const reopened = client().api
    const data = await reopened.listHabits({includeLogs:true,startDate:"2026-10-01",endDate:"2026-10-31"})
    expect(data[0].achieved).toBe(1)
    expect(data[0].logs[0].date).toBe("2026-10-11")
    await reopened.setDayStatus("habit","2026-10-11",false)
    expect((await reopened.listHabits({includeLogs:true}))[0].logs).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
    connection.mockReturnValue(true)
  })

  it("replays the same command after a lost response and never doubles optimistic logs", async () => {
    await cacheHabits("alice",[habit])
    const applied = new Map<string, any>(), delivered: string[] = []
    let loseResponse = true
    vi.stubGlobal("fetch",vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/habits/sync")) {
        const command = JSON.parse(init.body as string)
        delivered.push(command.id); applied.set(command.id,command)
        if (loseResponse) { loseResponse=false; throw new TypeError("Response lost") }
        return respond({synced:true})
      }
      const logs = [...applied.values()].flatMap(command => Array.from({length:command.count},(_,index)=>({id:`${command.id}-${index}`,habitId:"habit",logDate:command.date,loggedAt:command.loggedAt,note:null})))
      return respond([{...habit,logs}])
    }))
    const { api } = client()
    expect((await api.addLog("habit","2026-10-11",2)).logs).toHaveLength(2)
    expect((await readOffline("alice")).pending).toHaveLength(1)
    await api.prepareOffline()
    expect(projectHabits(await readOffline("alice"),{includeLogs:true})![0].logs).toHaveLength(2)
    await client().api.syncOffline()
    expect(delivered).toHaveLength(2)
    expect(delivered[0]).toBe(delivered[1])
    expect((await readOffline("alice")).pending).toHaveLength(0)
    expect((await readOffline("alice")).habits![0].logs).toHaveLength(2)
  })

  it("does not expose one account's cached data to another, and rejects stale authenticated reads", async () => {
    await cacheHabits("alice",[habit]); await cacheRead("alice","/auth/me",{id:"alice"})
    online(false); vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new TypeError("offline")))
    await expect(client("bob").api.listHabits({includeLogs:true})).rejects.toMatchObject({code:"OFFLINE_UNAVAILABLE"})
    online(true); vi.stubGlobal("fetch",vi.fn().mockImplementation(async () => respond(null,401)))
    await expect(client("alice").api.me()).rejects.toMatchObject({code:"UNAUTHORIZED"})
  })

  it("keeps pending changes after logout but removes cached reads and stops syncing without credentials", async () => {
    await cacheHabits("alice",[habit]); await cacheRead("alice","/auth/me",{id:"alice"})
    await enqueueCheckIn("alice",{id:crypto.randomUUID(),habitId:"habit",kind:"set-day",completed:true,date:"2026-10-11",loggedAt:new Date().toISOString()})
    const { api, signOut } = client(); signOut(); await clearOfflineReads("alice")
    const fetchMock = vi.fn(); vi.stubGlobal("fetch",fetchMock)
    await api.syncOffline()
    const data = await readOffline("alice")
    expect(data.habits).toBeNull(); expect(data.reads).toEqual({}); expect(data.pending).toHaveLength(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("retains a rejected command instead of silently discarding an offline check-in", async () => {
    await cacheHabits("alice",[habit]); online(false)
    const { api } = client(); await api.addLog("habit","2026-10-11")
    online(true)
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({success:false,error:{code:"HABIT_REMOVED",message:"Ritual removed."}},{status:404})))
    await expect(api.syncOffline()).rejects.toMatchObject({code:"HABIT_REMOVED"})
    expect((await readOffline("alice")).pending).toHaveLength(1)
  })

  it("preserves an acknowledged check-in when the follow-up snapshot is unavailable", async () => {
    await cacheHabits("alice",[habit]); online(false)
    const { api } = client(); await api.addLog("habit","2026-10-11")
    online(true)
    vi.stubGlobal("fetch",vi.fn(async (url: string) => {
      if (url.endsWith("/habits/sync")) return respond({synced:true})
      throw new TypeError("Connection lost after acknowledgment")
    }))
    await api.syncOffline()
    const state = await readOffline("alice")
    expect(state.pending).toHaveLength(0)
    expect(projectHabits(state,{includeLogs:true})![0].logs).toHaveLength(1)
  })
})
