import type { RegistryPackage } from "@/lib/types"

export function getPackagePrimaryAction(item: RegistryPackage): "install" | "update" | "installed" {
  if (!item.installation) {
    return "install"
  }

  if (item.hasUpdate) {
    return "update"
  }

  return "installed"
}
