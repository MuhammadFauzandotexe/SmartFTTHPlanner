import type { Geometry } from "geojson"
import { colors, type Category } from "./survey"

export const SETTINGS_KEY = "smart-ftth-planner.layer-settings.v1"
export const categories = Object.keys(colors) as Category[]
export type BaseMap = "street" | "satellite"
export type LayerStyle = { visible: boolean; color: string; markerSize: number; lineWidth: number; fillOpacity: number }
export type LayerSettings = { version: 1; baseMap: BaseMap; order: Category[]; layers: Record<Category, LayerStyle> }
export const baseMaps = {
  street: {
    name: "Peta jalan", provider: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    terms: "https://operations.osmfoundation.org/policies/tiles/",
  },
  satellite: {
    name: "Citra satelit", provider: "Esri World Imagery",
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tiles &copy; <a href="https://goto.arcgisonline.com/maps/World_Imagery">Esri</a> &mdash; Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
    terms: "https://www.esri.com/en-us/legal/terms/web-site-service",
  },
} as const

export function defaultLayerSettings(): LayerSettings {
  return {
    version: 1, baseMap: "street",
    // First item appears above the others; polygons commonly belong to the last category.
    order: [...categories],
    layers: Object.fromEntries(categories.map(category => [category, {
      visible: true, color: colors[category], markerSize: category === "Rumah" ? 20 : category === "Tiang" ? 10 : 14,
      lineWidth: 3, fillOpacity: 0.15,
    }])) as Record<Category, LayerStyle>,
  }
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function number(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}
export function normalizeLayerSettings(value: unknown): LayerSettings {
  const defaults = defaultLayerSettings()
  const saved = object(value)
  if (saved.version !== 1) return defaults
  const layers = object(saved.layers)
  for (const category of categories) {
    const input = object(layers[category])
    const fallback = defaults.layers[category]
    defaults.layers[category] = {
      visible: typeof input.visible === "boolean" ? input.visible : fallback.visible,
      color: typeof input.color === "string" && /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : fallback.color,
      markerSize: number(input.markerSize, fallback.markerSize, 8, 40),
      lineWidth: number(input.lineWidth, fallback.lineWidth, 1, 10),
      fillOpacity: number(input.fillOpacity, fallback.fillOpacity, 0, 1),
    }
  }
  defaults.baseMap = saved.baseMap === "satellite" ? "satellite" : "street"
  if (Array.isArray(saved.order)) {
    const valid = saved.order.filter((item): item is Category => categories.includes(item as Category))
    defaults.order = [...new Set([...valid, ...categories])]
  }
  return defaults
}
export function moveLayer(order: Category[], category: Category, direction: -1 | 1): Category[] {
  const next = [...order]
  const index = next.indexOf(category)
  const target = index + direction
  if (index < 0 || target < 0 || target >= next.length) return next
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
export function layerPaneName(category: Category) { return `survey-category-${categories.indexOf(category)}` }
export function layerZIndex(order: Category[], category: Category) { return 410 + (categories.length - order.indexOf(category)) * 10 }
export function geometryKinds(geometry: Geometry): Set<"point" | "line" | "polygon"> {
  if (geometry.type === "GeometryCollection") return new Set(geometry.geometries.flatMap(g => [...geometryKinds(g)]))
  if (geometry.type === "Point" || geometry.type === "MultiPoint") return new Set(["point"])
  if (geometry.type === "LineString" || geometry.type === "MultiLineString") return new Set(["line"])
  return new Set(["polygon"])
}
