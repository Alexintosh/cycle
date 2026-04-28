import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { useAuth } from "@/features/auth/auth-context"
import type { PasskeySummary } from "@/lib/types"

type ImportMode = "replace" | "append"

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function SettingsPage() {
  const { api, createPasskey, supportsPasskeys } = useAuth()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [importMode, setImportMode] = useState<ImportMode>("replace")
  const [passkeyName, setPasskeyName] = useState("")
  const [passkeys, setPasskeys] = useState<PasskeySummary[]>([])
  const [isLoadingPasskeys, setIsLoadingPasskeys] = useState(true)
  const [isCreatingPasskey, setIsCreatingPasskey] = useState(false)
  const [removingPasskeyId, setRemovingPasskeyId] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadPasskeys() {
      try {
        const items = await api.listPasskeys()
        if (!cancelled) {
          setPasskeys(items)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load passkeys.")
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPasskeys(false)
        }
      }
    }

    void loadPasskeys()
    return () => {
      cancelled = true
    }
  }, [api])

  const handleExport = async () => {
    setIsExporting(true)
    setStatusMessage(null)
    setError(null)
    try {
      const payload = await api.exportData()
      const date = new Date().toISOString().slice(0, 10)
      downloadJson(`cycle-export-${date}.json`, payload)
      setStatusMessage(
        `Exported ${payload.habits.length} rituals, ${payload.packages?.length ?? 0} packages, and ${payload.logs.length} logs.`,
      )
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export data.")
    } finally {
      setIsExporting(false)
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleCreatePasskey = async () => {
    setIsCreatingPasskey(true)
    setStatusMessage(null)
    setError(null)

    try {
      const created = await createPasskey(passkeyName)
      setPasskeys((current) => [created, ...current])
      setPasskeyName("")
      setStatusMessage(`Registered passkey "${created.name}".`)
    } catch (passkeyError) {
      setError(passkeyError instanceof Error ? passkeyError.message : "Failed to create passkey.")
    } finally {
      setIsCreatingPasskey(false)
    }
  }

  const handleDeletePasskey = async (passkeyId: string) => {
    setRemovingPasskeyId(passkeyId)
    setStatusMessage(null)
    setError(null)

    try {
      await api.deletePasskey(passkeyId)
      setPasskeys((current) => current.filter((item) => item.id !== passkeyId))
      setStatusMessage("Removed passkey.")
    } catch (passkeyError) {
      setError(passkeyError instanceof Error ? passkeyError.message : "Failed to remove passkey.")
    } finally {
      setRemovingPasskeyId(null)
    }
  }

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setIsImporting(true)
    setStatusMessage(null)
    setError(null)

    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as {
        version?: number
        habits?: Array<Record<string, unknown>>
        packages?: Array<Record<string, unknown>>
        logs?: Array<Record<string, unknown>>
      }

      if (!Array.isArray(parsed.habits) || !Array.isArray(parsed.logs)) {
        throw new Error("Invalid import file. Expected a JSON export with rituals and logs arrays.")
      }

      const result = await api.importData({
        version: parsed.version,
        mode: importMode,
        habits: parsed.habits,
        packages: Array.isArray(parsed.packages) ? parsed.packages : undefined,
        logs: parsed.logs,
      })

      setStatusMessage(
        `Imported ${result.importedHabits} rituals, ${result.importedPackages ?? 0} packages, and ${result.importedLogs} logs.`,
      )
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Failed to import data.")
    } finally {
      setIsImporting(false)
      event.target.value = ""
    }
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-600">Manage JSON exports and imports for your Cycle rituals and upkeep.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-white/70 p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Passkeys</h2>
          <p className="mt-1 text-sm text-slate-600">Register a passkey here, then use it from the login screen instead of waiting for an email code.</p>

          {supportsPasskeys ? (
            <>
              <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="passkey-name">
                Passkey label
              </label>
              <input
                id="passkey-name"
                className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm"
                maxLength={80}
                placeholder="MacBook Air, iPhone, YubiKey"
                value={passkeyName}
                onChange={(event) => setPasskeyName(event.target.value)}
              />

              <button
                className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isCreatingPasskey}
                onClick={() => void handleCreatePasskey()}
                type="button"
              >
                {isCreatingPasskey ? "Creating..." : "Add passkey"}
              </button>
            </>
          ) : (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              This browser does not support passkeys.
            </p>
          )}

          <div className="mt-5 space-y-3">
            {isLoadingPasskeys ? <p className="text-sm text-slate-500">Loading passkeys...</p> : null}
            {!isLoadingPasskeys && passkeys.length === 0 ? <p className="text-sm text-slate-500">No passkeys registered yet.</p> : null}
            {passkeys.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-xl border bg-white px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{item.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.deviceType === "multiDevice" ? "Synced passkey" : "Single-device credential"}
                    {item.lastUsedAt ? ` · Last used ${new Date(item.lastUsedAt).toLocaleString()}` : " · Never used"}
                  </p>
                </div>
                <button
                  className="rounded-lg border px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={removingPasskeyId === item.id}
                  onClick={() => void handleDeletePasskey(item.id)}
                  type="button"
                >
                  {removingPasskeyId === item.id ? "Removing..." : "Remove"}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border bg-white/70 p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Export</h2>
          <p className="mt-1 text-sm text-slate-600">Download your rituals, upkeep, and logs as a JSON file.</p>
          <button
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isExporting}
            onClick={() => void handleExport()}
            type="button"
          >
            {isExporting ? "Exporting..." : "Export JSON"}
          </button>
        </section>

        <section className="rounded-2xl border bg-white/70 p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Import</h2>
          <p className="mt-1 text-sm text-slate-600">Import a previously exported Cycle JSON file.</p>

          <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="import-mode">
            Import mode
          </label>
          <select
            id="import-mode"
            className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm"
            value={importMode}
            onChange={(event) => setImportMode(event.target.value as ImportMode)}
          >
            <option value="replace">Replace existing data</option>
            <option value="append">Append to existing data</option>
          </select>

          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void handleImportFile(event)}
          />

          <button
            className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isImporting}
            onClick={handleImportClick}
            type="button"
          >
            {isImporting ? "Importing..." : "Import JSON"}
          </button>
        </section>
      </div>

      {statusMessage ? <p className="mt-5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{statusMessage}</p> : null}
      {error ? <p className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
    </main>
  )
}
