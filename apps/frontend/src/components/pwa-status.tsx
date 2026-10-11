import { useEffect, useState } from "react"
import { useRegisterSW } from "virtual:pwa-register/react"
import { useAuth } from "@/features/auth/auth-context"
import { discardCheckIns, readOffline } from "@/offline/store"
import { Button } from "./ui/button"

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
export function PwaStatus() {
  const { api, user, status } = useAuth()
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState(0)
  const [saved, setSaved] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState("")
  const [install, setInstall] = useState<InstallEvent | null>(null)
  const [standalone] = useState(() => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)
  const { needRefresh: [updateAvailable], offlineReady: [offlineReady], updateServiceWorker } = useRegisterSW({ onRegisterError: () => setError("Offline app installation failed. Retry by reloading while online.") })
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)

  useEffect(() => {
    const offered = (event: Event) => { event.preventDefault(); setInstall(event as InstallEvent) }
    const installed = () => setInstall(null)
    window.addEventListener("beforeinstallprompt", offered)
    window.addEventListener("appinstalled", installed)
    return () => { window.removeEventListener("beforeinstallprompt", offered); window.removeEventListener("appinstalled", installed) }
  }, [])

  useEffect(() => {
    let cancelled = false
    const refreshState = async () => {
      if (!user || status !== "authenticated") { setPending(0); setSaved(false); return }
      const state = await readOffline(user.id)
      if (!cancelled) { setPending(state.pending.length); setSaved(state.habits !== null) }
    }
    const synchronize = async () => {
      setOnline(navigator.onLine)
      if (!user || status !== "authenticated" || !navigator.onLine) return
      setSyncing(true)
      try { await api.syncOffline(); await api.prepareOffline(); if (!cancelled) setError("") }
      catch (err) { if (!cancelled) setError(err instanceof TypeError ? "Waiting for a connection. Your check-ins are saved on this device." : err instanceof Error ? err.message : "Sync paused. Your check-ins are saved.") }
      finally { if (!cancelled) { setSyncing(false); void refreshState() } }
    }
    const connection = () => { setOnline(navigator.onLine); void synchronize() }
    const visible = () => { if (document.visibilityState === "visible") void synchronize() }
    const changed = () => { void refreshState().catch(() => setError("Unable to save data on this device. Check available storage.")) }
    window.addEventListener("online", connection); window.addEventListener("offline", connection)
    window.addEventListener("cycle:offline-state", changed); window.addEventListener("cycle:retry-sync", connection)
    document.addEventListener("visibilitychange", visible)
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void synchronize() }, 30000)
    void refreshState().catch(() => undefined); void synchronize()
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener("online", connection); window.removeEventListener("offline", connection); window.removeEventListener("cycle:offline-state", changed); window.removeEventListener("cycle:retry-sync", connection); document.removeEventListener("visibilitychange", visible) }
  }, [api, user?.id, status])

  const exportPending = async () => {
    if (!user) return
    const state = await readOffline(user.id)
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, userId: user.id, pending: state.pending }, null, 2)], { type: "application/json" }))
    const link = document.createElement("a"); link.href = url; link.download = "cycle-pending-checkins.json"; link.click(); URL.revokeObjectURL(url)
  }
  if (online && !pending && !error && !updateAvailable && !install && !(ios && !standalone) && !(offlineReady && saved)) return null
  return <aside aria-label="App and sync status" className="border-b bg-sky-50/95 dark:bg-sky-950/95 px-4 py-2 text-sm text-slate-700 dark:text-slate-300">
    <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2">
      <span role="status">{!online ? saved ? "Offline — saved rituals and check-ins are available." : "Offline — connect once to prepare offline access." : syncing && pending ? "Syncing check-ins…" : pending ? `${pending} check-in${pending === 1 ? "" : "s"} waiting to sync` : saved ? "Rituals saved for offline use" : "Connect once to prepare offline access"}</span>
      {pending > 0 && <><Button size="sm" variant="outline" disabled={!online || syncing} onClick={() => window.dispatchEvent(new Event("cycle:retry-sync"))}>Sync now</Button><Button size="sm" variant="ghost" onClick={() => void exportPending()}>Export pending</Button></>}
      {error && <span role="alert" className="text-red-700 dark:text-red-300">{error}</span>}
      {error && pending > 0 && <Button size="sm" variant="ghost" onClick={async () => {
        if (!user || !window.confirm("Discard all unsynced check-ins on this device? Export them first if you need to keep a copy.")) return
        await discardCheckIns(user.id); setError(""); window.dispatchEvent(new Event("cycle:data-synced")); window.dispatchEvent(new Event("cycle:retry-sync"))
      }}>Discard pending</Button>}
      {updateAvailable && <Button size="sm" variant="outline" disabled={pending > 0 || syncing} onClick={() => void updateServiceWorker(true)}>Update app{pending > 0 ? " after sync" : ""}</Button>}
      {install && <Button size="sm" variant="outline" onClick={async () => { await install.prompt(); if ((await install.userChoice).outcome === "accepted") setInstall(null) }}>Install Cycle</Button>}
      {ios && !standalone && <span>Install: Safari → Share → Add to Home Screen.</span>}
    </div>
  </aside>
}
