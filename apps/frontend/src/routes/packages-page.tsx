import { useMemo, useState } from "react"
import { toast } from "sonner"
import { EmptyState, ErrorState, LoadingState } from "@/components/page-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import type { InstalledPackageSummary, PackageItemDefinition, RegistryPackage } from "@/lib/types"

function formatInstalledDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
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
            Installed {formatInstalledDate(item.installation.installedAt)}.
            {" "}
            Tracking {item.installation.habitCount} rituals/upkeep items from this package.
          </div>
        ) : null}

        <ul className="grid gap-3 md:grid-cols-2">
          {item.items.map((packageItem) => (
            <PackageItemPreview key={packageItem.id} item={packageItem} />
          ))}
        </ul>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            disabled={isBusy || primaryAction === "installed"}
            onClick={() => void onPrimaryAction(item)}
          >
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

export function PackagesPage() {
  const { api } = useAuth()
  const { registryMeta, registry, installed, isLoading, error, refetch } = usePackagesQuery()
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null)
  const [packagePendingRemoval, setPackagePendingRemoval] = useState<InstalledPackageSummary | null>(null)

  const sortedRegistry = useMemo(
    () => [...registry].sort((a, b) => a.title.localeCompare(b.title)),
    [registry],
  )
  const sortedInstalled = useMemo(() => [...installed].sort((a, b) => a.title.localeCompare(b.title)), [installed])

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
      await runAction(
        `install:${item.id}`,
        () => api.installPackage(item.id),
        `${item.title} installed.`,
      )
      return
    }

    if (primaryAction === "update") {
      await runAction(
        `update:${item.id}`,
        () => api.updatePackage(item.id),
        `${item.title} updated.`,
      )
    }
  }

  const handleRemove = async (item: InstalledPackageSummary) => {
    await runAction(
      `remove:${item.packageId}`,
      () => api.removePackage(item.packageId),
      `${item.title} removed.`,
    )
    setPackagePendingRemoval(null)
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.2em] text-indigo-700">Packages</p>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950">Install rituals and upkeep bundles</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Browse the Cycle registry, install curated bundles of recurring life maintenance, and keep them up to date as the package authors refine the details.
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
            <CardHeader>
              <CardTitle className="text-xl">Registry</CardTitle>
              <CardDescription>Install packages from the internal catalog. In the future this registry can come from a separate repo.</CardDescription>
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

      <AlertDialog open={Boolean(packagePendingRemoval)} onOpenChange={(open) => {
        if (!open) {
          setPackagePendingRemoval(null)
        }
      }}>
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
