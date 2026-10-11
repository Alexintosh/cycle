import "fake-indexeddb/auto"
import { deleteDB } from "idb"
import { render, screen, waitFor, cleanup } from "@testing-library/react"
import { beforeEach, afterEach, expect, it, vi } from "vitest"
import { AuthProvider, useAuth } from "./auth-context"
import { cacheRead, cacheHabits } from "@/offline/store"

beforeEach(async () => { await deleteDB("cycle-offline"); localStorage.clear() })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function Probe() { const { status, user } = useAuth(); return <div>{status} {user?.email}</div> }
async function savedAccount() {
  const user = {id:"alice",email:"alice@example.com",displayName:"Alice",authMode:"standard"}
  localStorage.setItem("habit-tracker.session",JSON.stringify({token:"access",refreshToken:"refresh"}))
  localStorage.setItem("cycle.offline-profile",JSON.stringify(user))
  await cacheRead("alice","/auth/me",user); await cacheHabits("alice",[])
}
it("reopens the previously authenticated account offline without attempting a new login", async () => {
  await savedAccount()
  vi.spyOn(navigator,"onLine","get").mockReturnValue(false)
  vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new TypeError("offline")))
  render(<AuthProvider><Probe /></AuthProvider>)
  await waitFor(() => expect(screen.getByText("authenticated alice@example.com")).toBeInTheDocument())
  expect(localStorage.getItem("habit-tracker.session")).not.toBeNull()
})
it("does not use a cached profile to bypass an explicit server rejection", async () => {
  await savedAccount()
  vi.spyOn(navigator,"onLine","get").mockReturnValue(true)
  vi.stubGlobal("fetch",vi.fn().mockImplementation(async (url:string) => url.endsWith('/auth/mode') ? Response.json({success:true,data:{mode:'standard'}}) : Response.json({success:false,error:{code:'INVALID_TOKEN',message:'Expired'}},{status:401})))
  render(<AuthProvider><Probe /></AuthProvider>)
  await waitFor(() => expect(screen.getByText("anonymous")).toBeInTheDocument())
  await waitFor(() => expect(localStorage.getItem("habit-tracker.session")).toBeNull())
})
