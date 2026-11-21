export const DEFAULT_MARKER_SCALE = 1
const STORAGE_KEY = "smart-ftth:map-appearance"

export function isMarkerScale(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0.5 && value <= 2
}
export function loadMarkerScale(storage: Pick<Storage, "getItem">): number {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null")?.markerScale
    return isMarkerScale(value) ? value : DEFAULT_MARKER_SCALE
  } catch { return DEFAULT_MARKER_SCALE }
}
export function saveMarkerScale(storage: Pick<Storage, "setItem">, markerScale: number): void {
  if (!isMarkerScale(markerScale)) return
  storage.setItem(STORAGE_KEY, JSON.stringify({ markerScale }))
}
