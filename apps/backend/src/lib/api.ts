export function ok<T>(data: T) {
  return {
    success: true as const,
    data,
  }
}

export function fail(
  set: { status?: number | string },
  status: number,
  code: string,
  message: string,
  details: Record<string, unknown> = {},
) {
  set.status = status

  return {
    success: false as const,
    error: {
      code,
      message,
      ...details,
    },
  }
}
