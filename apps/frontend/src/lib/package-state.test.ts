import { describe, expect, it } from "vitest"
import { getPackagePrimaryAction } from "@/lib/package-state"
import type { RegistryPackage } from "@/lib/types"

describe("getPackagePrimaryAction", () => {
  it("returns install when the package is not yet installed", () => {
    const pkg = {
      id: "pkg.theme",
      title: "Theme Pack",
      description: "Theme presets.",
      author: "Cycle",
      version: "2.0.0",
      tags: ["design"],
      items: [],
      itemCount: 0,
      installation: null,
      versionStatus: "not-installed",
      hasUpdate: false,
    } satisfies RegistryPackage

    expect(getPackagePrimaryAction(pkg)).toBe("install")
  })

  it("returns update when the package has an update available", () => {
    const pkg = {
      id: "pkg.core",
      title: "Core",
      description: "Core package.",
      author: "Cycle",
      version: "3.4.1",
      tags: ["core"],
      items: [],
      itemCount: 0,
      installation: {
        id: "1",
        packageId: "pkg.core",
        title: "Core",
        description: "Core package.",
        author: "Cycle",
        installedVersion: "3.0.0",
        installedAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
        habitCount: 2,
      },
      versionStatus: "update-available",
      hasUpdate: true,
    } satisfies RegistryPackage

    expect(getPackagePrimaryAction(pkg)).toBe("update")
  })

  it("returns installed when the package is current", () => {
    const pkg = {
      id: "pkg.core",
      title: "Core",
      description: "Core package.",
      author: "Cycle",
      version: "3.4.1",
      tags: ["core"],
      items: [],
      itemCount: 0,
      installation: {
        id: "1",
        packageId: "pkg.core",
        title: "Core",
        description: "Core package.",
        author: "Cycle",
        installedVersion: "3.4.1",
        installedAt: "2026-04-20T00:00:00.000Z",
        updatedAt: "2026-04-20T00:00:00.000Z",
        habitCount: 2,
      },
      versionStatus: "current",
      hasUpdate: false,
    } satisfies RegistryPackage

    expect(getPackagePrimaryAction(pkg)).toBe("installed")
  })
})
