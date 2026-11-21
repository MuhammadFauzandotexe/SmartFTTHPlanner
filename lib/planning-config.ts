export type PlanningConfig = { maxDropLengthMeters: number }
export const DEFAULT_PLANNING_CONFIG: Readonly<PlanningConfig> = Object.freeze({ maxDropLengthMeters: 60 })
export const PLANNING_CONFIG_STORAGE_KEY = "smart-ftth:planning-config"
export const DROP_LAST_SPAN_METERS = 35
export const DISTANCE_EPSILON_METERS = 1e-6

export function isValidDropLength(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}
export function maxDropLength(config: PlanningConfig = DEFAULT_PLANNING_CONFIG): number {
  if (!isValidDropLength(config.maxDropLengthMeters)) throw new Error("Maksimal Panjang Drop harus berupa angka positif dan valid")
  return config.maxDropLengthMeters
}
export function parseDropLengthInput(input: string): number | null {
  const text = input.trim()
  if (!/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null
  const value = Number(text)
  return isValidDropLength(value) ? value : null
}

type ConfigStorage = Pick<Storage, "getItem" | "setItem">
export function loadPlanningConfig(storage: ConfigStorage): PlanningConfig {
  try {
    const stored = JSON.parse(storage.getItem(PLANNING_CONFIG_STORAGE_KEY) ?? "null")
    if (isValidDropLength(stored?.maxDropLengthMeters)) return { maxDropLengthMeters: stored.maxDropLengthMeters }
  } catch { /* Invalid or inaccessible storage leaves the new-plan default intact. */ }
  return { ...DEFAULT_PLANNING_CONFIG }
}
export function savePlanningConfig(storage: ConfigStorage, config: PlanningConfig): void {
  maxDropLength(config)
  let existing: Record<string, unknown> = {}
  try {
    const stored = JSON.parse(storage.getItem(PLANNING_CONFIG_STORAGE_KEY) ?? "null")
    if (stored && typeof stored === "object" && !Array.isArray(stored)) existing = stored
  } catch { /* Replace a malformed record only when the user applies a new setting. */ }
  storage.setItem(PLANNING_CONFIG_STORAGE_KEY, JSON.stringify({ ...existing, ...config }))
}
