import type { PackageVersionStatus } from "./types.ts"

function parseVersion(value: string) {
  const normalized = value.trim()
  if (!normalized) {
    return null
  }

  const segments = normalized.split(".").map((segment) => Number.parseInt(segment, 10))
  if (segments.some((segment) => Number.isNaN(segment) || segment < 0)) {
    return null
  }

  return segments
}

export function compareVersions(left: string, right: string) {
  const leftParts = parseVersion(left)
  const rightParts = parseVersion(right)

  if (!leftParts || !rightParts) {
    return null
  }

  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0
    const rightValue = rightParts[index] ?? 0

    if (leftValue > rightValue) {
      return 1
    }

    if (leftValue < rightValue) {
      return -1
    }
  }

  return 0
}

export function getVersionStatus(installedVersion: string | null | undefined, registryVersion: string): PackageVersionStatus {
  if (!installedVersion) {
    return "not-installed"
  }

  const comparison = compareVersions(installedVersion, registryVersion)
  if (comparison === null) {
    return "unknown"
  }

  if (comparison < 0) {
    return "update-available"
  }

  if (comparison > 0) {
    return "ahead"
  }

  return "current"
}
