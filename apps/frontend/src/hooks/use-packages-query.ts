import { useCallback, useEffect, useRef, useState } from "react"
import { ApiError } from "@/api/client"
import { useAuth } from "@/features/auth/auth-context"
import type {
  InstalledPackageSummary,
  OwnedPackage,
  PackageRegistryPayload,
  RegistryPackage,
} from "@/lib/types"

type UsePackagesQueryResult = {
  registryMeta: Omit<PackageRegistryPayload, "packages">
  registry: RegistryPackage[]
  owned: OwnedPackage[]
  installed: InstalledPackageSummary[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function usePackagesQuery(): UsePackagesQueryResult {
  const { status, api, user } = useAuth()
  const accountRef = useRef<string | undefined>(user?.id)
  accountRef.current = user?.id
  const [registryMeta, setRegistryMeta] = useState<Omit<PackageRegistryPayload, "packages">>({
    schemaVersion: 1,
    updatedAt: "",
  })
  const [registry, setRegistry] = useState<RegistryPackage[]>([])
  const [owned, setOwned] = useState<OwnedPackage[]>([])
  const [installed, setInstalled] = useState<InstalledPackageSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (status !== "authenticated") {
      setRegistryMeta({ schemaVersion: 1, updatedAt: "" })
      setRegistry([])
      setOwned([])
      setInstalled([])
      setIsLoading(false)
      setError(null)
      return
    }

    const account = accountRef.current
    try {
      setIsLoading(true)
      setError(null)
      const [nextRegistry, nextOwned, nextInstalled] = await Promise.all([
        api.listPackageRegistry(),
        api.listOwnedPackages(),
        api.listInstalledPackages(),
      ])
      if (accountRef.current !== account) return
      setRegistryMeta({
        schemaVersion: nextRegistry.schemaVersion,
        updatedAt: nextRegistry.updatedAt,
      })
      setRegistry(nextRegistry.packages)
      setOwned(nextOwned)
      setInstalled(nextInstalled)
    } catch (loadError) {
      if (accountRef.current !== account) return
      const message = loadError instanceof ApiError ? loadError.message : "Something went wrong while loading packages."
      setError(message)
    } finally {
      if (accountRef.current === account) setIsLoading(false)
    }
  }, [api, status, user?.id])

  useEffect(() => {
    void refetch()
  }, [refetch])

  useEffect(() => {
    const synced = () => { void refetch() }
    window.addEventListener("cycle:data-synced", synced)
    return () => window.removeEventListener("cycle:data-synced", synced)
  }, [refetch])

  return {
    registryMeta,
    registry,
    owned,
    installed,
    isLoading,
    error,
    refetch,
  }
}
