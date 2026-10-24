import type { Feature, Geometry, GeoJsonProperties, Position } from "geojson"

export type Category = "Tiang" | "Rumah" | "FAT" | "FDT" | "Jalur kabel" | "Belum dikategorikan"
export type FeatureItem = {
  id: string
  name: string
  category: Category
  file: string
  kmlFile: string
  kind: Geometry["type"]
  geometry: Geometry
  coords: [number, number] // latitude, longitude; titik pertama untuk panel detail
  description?: string
  props: GeoJsonProperties
}

export const colors: Record<Category, string> = {
  Tiang: "#20a36a", Rumah: "#3b82f6", FAT: "#f59e0b", FDT: "#8b5cf6",
  "Jalur kabel": "#ef5b5b", "Belum dikategorikan": "#94a3b8",
}

export function parseCategory(name: string, geometry: Geometry): Category {
  if (geometry.type === "LineString" || geometry.type === "MultiLineString") return "Jalur kabel"
  const n = name.toUpperCase()
  if (n.includes("FDT")) return "FDT"
  if (n.includes("FAT")) return "FAT"
  if (n.includes("POLE") || n.includes("TIANG")) return "Tiang"
  if (n.includes("RUMAH") || n.includes("HOME") || n.includes("PELANGGAN")) return "Rumah"
  if (geometry.type === "Point" && /^\d+$/.test(name.trim())) return "Rumah"
  return "Belum dikategorikan"
}

function validPosition(p: Position): boolean {
  return Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite)
    && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90
}
function validLine(p: Position[]): boolean {
  return p.length >= 2 && p.every(validPosition)
}
function validPolygon(rings: Position[][]): boolean {
  return rings.length > 0 && rings.every(ring => ring.length >= 4 && ring.every(validPosition)
    && ring[0].length === ring[ring.length - 1].length
    && ring[0].every((value, i) => value === ring[ring.length - 1][i]))
}

export function validGeometry(g: Geometry | null): g is Geometry {
  if (!g) return false
  switch (g.type) {
    case "Point": return validPosition(g.coordinates)
    case "MultiPoint": return g.coordinates.length > 0 && g.coordinates.every(validPosition)
    case "LineString": return validLine(g.coordinates)
    case "MultiLineString": return g.coordinates.length > 0 && g.coordinates.every(validLine)
    case "Polygon": return validPolygon(g.coordinates)
    case "MultiPolygon": return g.coordinates.length > 0 && g.coordinates.every(validPolygon)
    case "GeometryCollection": return g.geometries.length > 0 && g.geometries.every(validGeometry)
    default: return false
  }
}

export function firstPosition(g: Geometry): Position {
  switch (g.type) {
    case "Point": return g.coordinates
    case "MultiPoint": case "LineString": return g.coordinates[0]
    case "MultiLineString": case "Polygon": return g.coordinates[0][0]
    case "MultiPolygon": return g.coordinates[0][0][0]
    case "GeometryCollection": return firstPosition(g.geometries[0])
  }
}

export function toGeoJSON(item: FeatureItem): Feature {
  return {
    type: "Feature",
    id: item.id,
    geometry: item.geometry,
    properties: { id: item.id, name: item.name, category: item.category, source: item.file, kmlFile: item.kmlFile, ...item.props },
  }
}
