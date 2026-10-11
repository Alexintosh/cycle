import { useMemo, useState } from "react"
import { toast } from "sonner"
import { EmptyState, ErrorState, LoadingState } from "@/components/page-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useAuth } from "@/features/auth/auth-context"
import { usePackagesQuery } from "@/hooks/use-packages-query"
import { getPackagePrimaryAction } from "@/lib/package-state"
import type {
  Frequency,
  InstalledPackageSummary,
  OwnedPackage,
  PackageItemDefinition,
  PackageUpsertInput,
  RegistryPackage,
} from "@/lib/types"

const timeframeOptions: Frequency[] = ["daily", "weekly", "monthly", "quarterly", "semiannual", "yearly"]

type PackageEditorItem = {
  id: string
  timeframe: Frequency
  emoji: string
  title: string
  description: string
  goal: string
  section: string
  color: string
}

type PackageEditorState = {
  title: string
  description: string
  version: string
  tags: string
  items: PackageEditorItem[]
}

function formatInstalledDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function createEditorItem(): PackageEditorItem {
  return {
    id: crypto.randomUUID(),
    timeframe: "weekly",
    emoji: "✨",
    title: "",
    description: "",
    goal: "",
    section: "OTHER",
    color: "#E2E8F0",
  }
}

function createEmptyDraft(): PackageEditorState {
  return {
    title: "",
    description: "",
    version: "1.0.0",
    tags: "",
    items: [createEditorItem()],
  }
}

function createDraftFromPackage(pkg: OwnedPackage): PackageEditorState {
  return {
    title: pkg.title,
    description: pkg.description,
    version: pkg.version,
    tags: pkg.tags.join(", "),
    items: pkg.items.map((item) => ({
      id: item.id,
      timeframe: item.timeframe,
      emoji: item.emoji ?? "✨",
      title: item.title,
      description: item.description,
      goal: item.goal == null ? "" : String(item.goal),
      section: item.section,
      color: item.color ?? "#E2E8F0",
    })),
  }
}

function toPackagePayload(editor: PackageEditorState): PackageUpsertInput {
  return {
    title: editor.title.trim(),
    description: editor.description.trim(),
    version: editor.version.trim(),
    tags: editor.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    items: editor.items.map((item) => ({
      id: item.id,
      timeframe: item.timeframe,
      emoji: item.emoji.trim() || "✨",
      title: item.title.trim(),
      description: item.description.trim(),
      goal: item.goal.trim() === "" ? null : Number(item.goal),
      section: item.section.trim() || "OTHER",
      color: item.color.trim() || "#E2E8F0",
    })),
  }
}

function PackageItemPreview({ item }: { item: PackageItemDefinition }) {
  return (
    <li className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">
            <span className="mr-2">{item.emoji ?? "✨"}</span>
            {item.title}
          </p>
          <p className="mt-1 text-xs text-slate-500">{item.description}</p>
        </div>
        <div className="shrink-0 text-right text-[11px] uppercase tracking-[0.18em] text-slate-500">
          <p>{item.timeframe}</p>
          <p>{item.goal ? `${item.goal}x` : "flex"}</p>
        </div>
      </div>
    </li>
  )
}

function RegistryCard({
  item,
  actionKey,
  isBusy,
  onPrimaryAction,
  onRequestRemove,
}: {
  item: RegistryPackage
  actionKey: string | null
  isBusy: boolean
  onPrimaryAction: (item: RegistryPackage) => Promise<void>
  onRequestRemove: (item: InstalledPackageSummary) => void
}) {
  const primaryAction = getPackagePrimaryAction(item)
  const isInstalled = Boolean(item.installation)

  return (
    <Card className="rounded-[1.5rem] border-slate-200 bg-white/90 shadow-soft">
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-sky-700">{item.author}</p>
            <CardTitle className="mt-1 text-2xl text-slate-950">{item.title}</CardTitle>
            <CardDescription className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{item.description}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{item.version}</Badge>
            <Badge variant="outline">{item.itemCount} items</Badge>
            {item.hasUpdate ? <Badge>Update available</Badge> : null}
            {isInstalled && !item.hasUpdate ? <Badge variant="secondary">Installed</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {item.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
              {tag}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {item.installation ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
            Installed {formatInstalledDate(item.installation.installedAt)}. Tracking {item.installation.habitCount} rituals/upkeep
            items from this package.
          </div>
        ) : null}

        <ul className="grid gap-3 md:grid-cols-2">
          {item.items.map((packageItem) => (
            <PackageItemPreview key={packageItem.id} item={packageItem} />
          ))}
        </ul>

        <div className="flex flex-wrap gap-3">
          <Button type="button" disabled={isBusy || primaryAction === "installed"} onClick={() => void onPrimaryAction(item)}>
            {isBusy ? "Working..." : primaryAction === "install" ? "Install package" : primaryAction === "update" ? "Update package" : "Installed"}
          </Button>
          {item.installation ? (
            <Button
              type="button"
              variant="destructive"
              disabled={actionKey === `remove:${item.installation.packageId}`}
              onClick={() => {
                const installation = item.installation
                if (!installation) {
                  return
                }

                onRequestRemove(installation)
              }}
            >
              {actionKey === `remove:${item.installation.packageId}` ? "Removing..." : "Remove"}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function OwnedPackageCard({
  item,
  isActive,
  onEdit,
}: {
  item: OwnedPackage
  isActive: boolean
  onEdit: (item: OwnedPackage) => void
}) {
  return (
    <div className={`rounded-2xl border p-4 ${isActive ? "border-sky-400 bg-sky-50/70" : "border-slate-200 bg-slate-50/70"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-slate-950">{item.title}</p>
          <p className="mt-1 text-sm text-slate-600">{item.description || "No description yet."}</p>
        </div>
        <Badge variant="outline">{item.version}</Badge>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-600">
        <span>{item.itemCount} items</span>
        <span>·</span>
        <span>Updated {formatInstalledDate(item.updatedAt)}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {item.tags.map((tag) => (
          <Badge key={tag} variant="outline" className="border-slate-200 bg-white text-slate-700">
            {tag}
          </Badge>
        ))}
      </div>
      <div className="mt-4">
        <Button type="button" variant={isActive ? "secondary" : "outline"} onClick={() => onEdit(item)}>
          {isActive ? "Editing" : "Edit package"}
        </Button>
      </div>
    </div>
  )
}

export function PackagesPage() {
  const { api } = useAuth()
  const { registryMeta, registry, owned, installed, isLoading, error, refetch } = usePackagesQuery()
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null)
  const [packagePendingRemoval, setPackagePendingRemoval] = useState<InstalledPackageSummary | null>(null)
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null)
  const [editor, setEditor] = useState<PackageEditorState>(() => createEmptyDraft())

  const sortedRegistry = useMemo(() => [...registry].sort((a, b) => a.title.localeCompare(b.title)), [registry])
  const sortedOwned = useMemo(() => [...owned].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [owned])
  const sortedInstalled = useMemo(() => [...installed].sort((a, b) => a.title.localeCompare(b.title)), [installed])
  const editingPackage = sortedOwned.find((item) => item.id === editingPackageId) ?? null

  const runAction = async (actionKey: string, execute: () => Promise<unknown>, successMessage: string) => {
    setActiveActionKey(actionKey)
    try {
      await execute()
      await refetch()
      toast.success(successMessage)
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "Something went wrong."
      toast.error(message)
    } finally {
      setActiveActionKey(null)
    }
  }

  const handleRegistryAction = async (item: RegistryPackage) => {
    const primaryAction = getPackagePrimaryAction(item)

    if (primaryAction === "install") {
      await runAction(`install:${item.id}`, () => api.installPackage(item.id), `${item.title} installed.`)
      return
    }

    if (primaryAction === "update") {
      await runAction(`update:${item.id}`, () => api.updatePackage(item.id), `${item.title} updated.`)
    }
  }

  const handleRemove = async (item: InstalledPackageSummary) => {
    await runAction(`remove:${item.packageId}`, () => api.removePackage(item.packageId), `${item.title} removed.`)
    setPackagePendingRemoval(null)
  }

  const resetEditor = () => {
    setEditingPackageId(null)
    setEditor(createEmptyDraft())
  }

  const startEditing = (item: OwnedPackage) => {
    setEditingPackageId(item.id)
    setEditor(createDraftFromPackage(item))
  }

  const addItem = () => {
    setEditor((current) => ({
      ...current,
      items: [...current.items, createEditorItem()],
    }))
  }

  const updateItem = (itemId: string, field: keyof PackageEditorItem, value: string) => {
    setEditor((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)),
    }))
  }

  const removeItem = (itemId: string) => {
    setEditor((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== itemId),
    }))
  }

  const publishPackage = async () => {
    const actionKey = editingPackageId ? `publish:${editingPackageId}` : "publish:new"
    setActiveActionKey(actionKey)

    try {
      const payload = toPackagePayload(editor)
      const saved = editingPackageId ? await api.updateOwnedPackage(editingPackageId, payload) : await api.createOwnedPackage(payload)
      await refetch()
      setEditingPackageId(saved.id)
      setEditor(createDraftFromPackage(saved))
      toast.success(editingPackageId ? "Package update published." : "Package published.")
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "Unable to publish package."
      toast.error(message)
    } finally {
      setActiveActionKey(null)
    }
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.2em] text-indigo-700">Packages</p>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950">Create, publish, and install life systems</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Packages are public by default. There are no drafts here: saving a package publishes it immediately into the Cycle registry.
        </p>
        <p className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-500">
          Registry v{registryMeta.schemaVersion}
          {registryMeta.updatedAt ? ` · updated ${formatInstalledDate(registryMeta.updatedAt)}` : ""}
        </p>
      </div>

      {isLoading ? (
        <LoadingState message="Loading package metadata..." />
      ) : error ? (
        <ErrorState message={error} />
      ) : (
        <div className="space-y-6">
          <Card className="rounded-[1.25rem] bg-white/90 shadow-soft">
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="text-xl">Your packages</CardTitle>
                <CardDescription>Create new packages or publish updates to packages you already own.</CardDescription>
              </div>
              <Button type="button" onClick={resetEditor}>
                Create package
              </Button>
            </CardHeader>
            <CardContent>
              {sortedOwned.length === 0 ? (
                <EmptyState
                  title="No packages published yet"
                  message="Create your first public package below. It will appear in the registry immediately after publishing."
                />
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {sortedOwned.map((item) => (
                    <OwnedPackageCard key={item.id} item={item} isActive={editingPackageId === item.id} onEdit={startEditing} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[1.25rem] bg-white/90 shadow-soft">
            <CardHeader>
              <CardTitle className="text-xl">{editingPackage ? `Edit ${editingPackage.title}` : "Publish a new package"}</CardTitle>
              <CardDescription>
                {editingPackage
                  ? "Changes are public as soon as you publish the update."
                  : "Publishing creates a public package immediately. There is no separate draft state."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="package-title">Title</Label>
                  <Input
                    id="package-title"
                    value={editor.title}
                    onChange={(event) => setEditor((current) => ({ ...current, title: event.target.value }))}
                    placeholder="Deep-clean apartment"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="package-version">Version</Label>
                  <Input
                    id="package-version"
                    value={editor.version}
                    onChange={(event) => setEditor((current) => ({ ...current, version: event.target.value }))}
                    placeholder="1.0.0"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="package-description">Description</Label>
                <Textarea
                  id="package-description"
                  value={editor.description}
                  onChange={(event) => setEditor((current) => ({ ...current, description: event.target.value }))}
                  placeholder="What does this package help someone maintain?"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="package-tags">Tags</Label>
                <Input
                  id="package-tags"
                  value={editor.tags}
                  onChange={(event) => setEditor((current) => ({ ...current, tags: event.target.value }))}
                  placeholder="home, cleaning, reset"
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">Package items</h2>
                    <p className="text-sm text-slate-600">These become the rituals or upkeep entries installed from this package.</p>
                  </div>
                  <Button type="button" variant="outline" onClick={addItem}>
                    Add item
                  </Button>
                </div>

                <div className="space-y-4">
                  {editor.items.map((item, index) => (
                    <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-600">Item {index + 1}</p>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={editor.items.length === 1}
                          onClick={() => removeItem(item.id)}
                        >
                          Remove
                        </Button>
                      </div>

                      <div className="grid gap-4 md:grid-cols-[90px,1fr,160px]">
                        <div className="space-y-2">
                          <Label>Emoji</Label>
                          <Input value={item.emoji} onChange={(event) => updateItem(item.id, "emoji", event.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Title</Label>
                          <Input value={item.title} onChange={(event) => updateItem(item.id, "title", event.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Timeframe</Label>
                          <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={item.timeframe}
                            onChange={(event) => updateItem(item.id, "timeframe", event.target.value)}
                          >
                            {timeframeOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="mt-4 space-y-2">
                        <Label>Description</Label>
                        <Textarea value={item.description} onChange={(event) => updateItem(item.id, "description", event.target.value)} />
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-4">
                        <div className="space-y-2">
                          <Label>Goal</Label>
                          <Input
                            type="number"
                            min="0"
                            value={item.goal}
                            onChange={(event) => updateItem(item.id, "goal", event.target.value)}
                            placeholder="1"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Section</Label>
                          <Input value={item.section} onChange={(event) => updateItem(item.id, "section", event.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Color</Label>
                          <Input type="color" value={item.color} onChange={(event) => updateItem(item.id, "color", event.target.value)} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  disabled={activeActionKey === (editingPackageId ? `publish:${editingPackageId}` : "publish:new")}
                  onClick={() => void publishPackage()}
                >
                  {activeActionKey === (editingPackageId ? `publish:${editingPackageId}` : "publish:new")
                    ? "Publishing..."
                    : editingPackageId
                      ? "Publish update"
                      : "Publish package"}
                </Button>
                {editingPackageId ? (
                  <Button type="button" variant="outline" onClick={resetEditor}>
                    Start new package
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[1.25rem] bg-white/90 shadow-soft">
            <CardHeader>
              <CardTitle className="text-xl">Registry</CardTitle>
              <CardDescription>Install public packages from the shared catalog and keep them up to date.</CardDescription>
            </CardHeader>
            <CardContent>
              {sortedRegistry.length === 0 ? (
                <EmptyState title="No packages in registry" message="No packages are currently available for installation." />
              ) : (
                <div className="space-y-5">
                  {sortedRegistry.map((item) => (
                    <RegistryCard
                      key={item.id}
                      item={item}
                      actionKey={activeActionKey}
                      isBusy={activeActionKey === `install:${item.id}` || activeActionKey === `update:${item.id}`}
                      onPrimaryAction={handleRegistryAction}
                      onRequestRemove={setPackagePendingRemoval}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[1.25rem] bg-white/90 shadow-soft">
            <CardHeader>
              <CardTitle className="text-xl">Installed</CardTitle>
              <CardDescription>Review installed packages and remove what you no longer need.</CardDescription>
            </CardHeader>
            <CardContent>
              {sortedInstalled.length === 0 ? (
                <EmptyState title="No packages installed" message="Install a package from the registry to get started." />
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {sortedInstalled.map((item) => {
                    const registryEntry = sortedRegistry.find((pkg) => pkg.id === item.packageId)
                    return (
                      <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold text-slate-950">{item.title}</p>
                            <p className="mt-1 text-sm text-slate-600">{item.description ?? item.packageId}</p>
                          </div>
                          <Badge variant="outline">{item.installedVersion}</Badge>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-600">
                          <span>{item.habitCount} items installed</span>
                          <span>·</span>
                          <span>Updated {formatInstalledDate(item.updatedAt)}</span>
                          {registryEntry?.hasUpdate ? (
                            <>
                              <span>·</span>
                              <Badge>Update available</Badge>
                            </>
                          ) : null}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3">
                          {registryEntry?.hasUpdate ? (
                            <Button
                              type="button"
                              disabled={activeActionKey === `update:${item.packageId}`}
                              onClick={() => void handleRegistryAction(registryEntry)}
                            >
                              {activeActionKey === `update:${item.packageId}` ? "Updating..." : "Update"}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="destructive"
                            disabled={activeActionKey === `remove:${item.packageId}`}
                            onClick={() => setPackagePendingRemoval(item)}
                          >
                            {activeActionKey === `remove:${item.packageId}` ? "Removing..." : "Remove"}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <AlertDialog
        open={Boolean(packagePendingRemoval)}
        onOpenChange={(open) => {
          if (!open) {
            setPackagePendingRemoval(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove package</AlertDialogTitle>
            <AlertDialogDescription>
              {packagePendingRemoval
                ? `This will remove all rituals and upkeep items installed from ${packagePendingRemoval.title}. Existing logs for those items will be deleted too.`
                : "This will remove the selected package."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!packagePendingRemoval) {
                  return
                }

                void handleRemove(packagePendingRemoval)
              }}
            >
              Remove package
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
