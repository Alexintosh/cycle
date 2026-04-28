import { useCallback, useEffect, useState } from "react"
import { ApiError } from "@/api/client"
import { useAuth } from "@/features/auth/auth-context"
import type {
  InstalledPackageSummary,
  PackageRegistryPayload,
  RegistryPackage,
} from "@/lib/types"

type UsePackagesQueryResult = {
  registryMeta: Omit<PackageRegistryPayload, "packages">
  registry: RegistryPackage[]
  installed: InstalledPackageSummary[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function usePackagesQuery(): UsePackagesQueryResult {
  const { status, api } = useAuth()
  const [registryMeta, setRegistryMeta] = useState<Omit<PackageRegistryPayload, "packages">>({
    schemaVersion: 1,
    updatedAt: "",
  })
  const [registry, setRegistry] = useState<RegistryPackage[]>([])
  const [installed, setInstalled] = useState<InstalledPackageSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (status !== "authenticated") {
      setRegistryMeta({ schemaVersion: 1, updatedAt: "" })
      setRegistry([])
      setInstalled([])
      setIsLoading(false)
      setError(null)
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      const [nextRegistry, nextInstalled] = await Promise.all([api.listPackageRegistry(), api.listInstalledPackages()])
      setRegistryMeta({
        schemaVersion: nextRegistry.schemaVersion,
        updatedAt: nextRegistry.updatedAt,
      })
      setRegistry(nextRegistry.packages)
      setInstalled(nextInstalled)
    } catch (loadError) {
      const message = loadError instanceof ApiError ? loadError.message : "Something went wrong while loading packages."
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [api, status])

  useEffect(() => {
    void refetch()
  }, [refetch])

  return {
    registryMeta,
    registry,
    installed,
    isLoading,
    error,
    refetch,
  }
}
