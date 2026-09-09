const STORAGE_KEY = "deviceFavorites"

/** Fired on `window` whenever the favorite list changes, so every picker on the page stays in sync. */
export const DEVICE_FAVORITES_EVENT = "device-favorites-change"

/**
 * Favorites are stored as device keys (`apple:m4 max`, `gpu:RTX 4090`, …) so the
 * device list and the hardware selectors share one list.
 */
export function readDeviceFavorites(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")
    if (!Array.isArray(parsed)) return []
    return parsed.filter((key): key is string => typeof key === "string")
  } catch {
    return []
  }
}

export function writeDeviceFavorites(keys: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys))
  } catch {
    // Storage can be unavailable (private mode, quota); still notify listeners.
  }
  window.dispatchEvent(new CustomEvent(DEVICE_FAVORITES_EVENT, { detail: keys }))
}

export function toggleDeviceFavorite(key: string): string[] {
  const current = readDeviceFavorites()
  const next = current.includes(key)
    ? current.filter((item) => item !== key)
    : [...current, key]
  writeDeviceFavorites(next)
  return next
}

export function clearDeviceFavorites(): void {
  writeDeviceFavorites([])
}
