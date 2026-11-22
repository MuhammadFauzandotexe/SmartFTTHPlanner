import JSZip from "jszip"
import { kml } from "@tmcw/togeojson"
import type { Geometry, Point, LineString, Polygon, Position } from "geojson"

export type Category = "Tiang" | "Rumah" | "FAT" | "FDT" | "Jalur kabel" | "Belum dikategorikan"
type SurveyGeometry = Point | LineString | Polygon
export type FeatureItem = {
  id: string
  name: string
  category: Category
  file: string
  kind: SurveyGeometry["type"]
  coords: [number, number]
  geometry: SurveyGeometry
  mountingPoleId?: string
  description?: string
  /** Explicit survey declaration; never inferred from a line's name or proximity. */
  dropSupport?: boolean
}

export function parseCategory(name: string): Category {
  const n = name.trim().toUpperCase()
  if (n.includes("FDT")) return "FDT"
  if (n.includes("FAT")) return "FAT"
  if (n.includes("POLE") || n.includes("TIANG")) return "Tiang"
  if (n.includes("RUMAH") || n.includes("HOME") || n.includes("PELANGGAN") ||
    n.includes("?") || /^[0-9]+[A-Z]*(?:\s*[-–—]\s*[0-9]+[A-Z]*)?$/.test(n)) return "Rumah"
  return "Belum dikategorikan"
}

function splitGeometry(geometry: Geometry): SurveyGeometry[] {
  switch (geometry.type) {
    case "Point": case "LineString": case "Polygon": return [geometry]
    case "MultiPoint": return geometry.coordinates.map(coordinates => ({ type: "Point", coordinates }))
    case "MultiLineString": return geometry.coordinates.map(coordinates => ({ type: "LineString", coordinates }))
    case "MultiPolygon": return geometry.coordinates.map(coordinates => ({ type: "Polygon", coordinates }))
    case "GeometryCollection": return geometry.geometries.flatMap(splitGeometry)
  }
}

function validPosition(position: Position): boolean {
  return position.length >= 2 && Number.isFinite(position[0]) && Number.isFinite(position[1]) &&
    Math.abs(position[0]) <= 180 && Math.abs(position[1]) <= 90
}

function validGeometry(geometry: SurveyGeometry): boolean {
  if (geometry.type === "Point") return validPosition(geometry.coordinates)
  if (geometry.type === "LineString") return geometry.coordinates.length >= 2 && geometry.coordinates.every(validPosition)
  return geometry.coordinates.length > 0 && geometry.coordinates.every(ring =>
    ring.length >= 4 && ring.every(validPosition) &&
    ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1])
}

export function parseKml(text: string, fileName: string, sourceId: string): FeatureItem[] {
  const doc = new DOMParser().parseFromString(text, "text/xml")
  if (doc.getElementsByTagName("parsererror").length || doc.documentElement?.localName !== "kml") {
    throw new Error("Dokumen KML tidak valid")
  }
  return kml(doc).features.flatMap((feature, index) => {
    if (!feature.geometry) return []
    const name = String(feature.properties?.name || `Fitur ${index + 1}`).trim()
    return splitGeometry(feature.geometry).filter(validGeometry).map((geometry, part) => {
      const first = geometry.type === "Point" ? geometry.coordinates :
        geometry.type === "LineString" ? geometry.coordinates[0] : geometry.coordinates[0][0]
      return {
        id: `${sourceId}-${index}-${part}`, name, file: fileName,
        category: geometry.type === "LineString" ? "Jalur kabel" : parseCategory(name),
        kind: geometry.type, coords: [first[1], first[0]] as [number, number], geometry,
        description: feature.properties?.description,
        dropSupport: geometry.type === "LineString" && ["true", "1"].includes(String(feature.properties?.drop_support ?? "").trim().toLowerCase()),
      }
    })
  })
}

export async function importSurveyFile(file: File): Promise<FeatureItem[]> {
  const sourceId = crypto.randomUUID()
  if (/\.kml$/i.test(file.name)) return parseKml(await file.text(), file.name, sourceId)
  if (!/\.kmz$/i.test(file.name)) throw new Error("Format tidak didukung. Gunakan KML atau KMZ")
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const entries = Object.values(zip.files).filter(entry => !entry.dir && /\.kml$/i.test(entry.name))
  if (!entries.length) throw new Error("Tidak ada file KML di dalam KMZ")
  const features: FeatureItem[] = []
  for (const [index, entry] of entries.entries()) {
    features.push(...parseKml(await entry.async("string"), file.name, `${sourceId}-${index}`))
  }
  return features
}
