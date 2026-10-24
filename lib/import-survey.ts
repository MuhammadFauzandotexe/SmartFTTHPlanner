import JSZip from "jszip"
import { kml } from "@tmcw/togeojson"
import { firstPosition, parseCategory, validGeometry, type FeatureItem } from "./survey"

export type ImportResult = { features: FeatureItem[]; warnings: string[] }

/** Read every embedded KML, including nested paths; no network links are fetched. */
export async function importSurveyFile(file: File): Promise<ImportResult> {
  if (!/\.(kml|kmz)$/i.test(file.name)) throw new Error("Format tidak didukung. Pilih file KML atau KMZ.")
  const entries: { name: string; text: () => Promise<string> }[] = []
  if (/\.kmz$/i.test(file.name)) {
    let zip: JSZip
    try { zip = await JSZip.loadAsync(await file.arrayBuffer()) }
    catch { throw new Error("Arsip KMZ rusak, terenkripsi, atau bukan file ZIP yang didukung.") }
    for (const entry of Object.values(zip.files).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.dir && /\.kml$/i.test(entry.name) && !entry.name.startsWith("__MACOSX/")) {
        entries.push({ name: entry.name, text: () => entry.async("string") })
      }
    }
    if (!entries.length) throw new Error("Tidak ditemukan file KML di dalam arsip KMZ.")
  } else {
    entries.push({ name: file.name, text: () => file.text() })
  }

  const result: ImportResult = { features: [], warnings: [] }
  const batchId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  for (const entry of entries) {
    try {
      const doc = new DOMParser().parseFromString(await entry.text(), "application/xml")
      if (doc.getElementsByTagName("parsererror").length || doc.documentElement.localName !== "kml") {
        throw new Error("XML KML tidak valid.")
      }
      if (doc.getElementsByTagNameNS("*", "NetworkLink").length) {
        result.warnings.push(`${entry.name}: NetworkLink eksternal tidak dimuat.`)
      }
      if (doc.getElementsByTagNameNS("*", "GroundOverlay").length) {
        result.warnings.push(`${entry.name}: gambar GroundOverlay tidak ditampilkan.`)
      }
      let skipped = 0
      const converted = kml(doc)
      converted.features.forEach((feature, index) => {
        if (!validGeometry(feature.geometry)) { skipped++; return }
        const geometry = feature.geometry
        const props = feature.properties || {}
        const name = String(props.name || `Fitur ${index + 1}`)
        const position = firstPosition(geometry)
        result.features.push({
          id: `${batchId}-${entry.name}-${index}`,
          name, category: parseCategory(name, geometry), file: file.name, kmlFile: entry.name,
          kind: geometry.type, geometry, coords: [position[1], position[0]],
          description: typeof props.description === "string" ? props.description : undefined,
          props: { ...props, ...(feature.id !== undefined ? { originalId: feature.id } : {}) },
        })
      })
      if (skipped) result.warnings.push(`${entry.name}: ${skipped} fitur tanpa geometri atau dengan koordinat/geometri tidak valid dilewati.`)
    } catch (error) {
      result.warnings.push(`${entry.name}: ${error instanceof Error ? error.message : "Gagal membaca KML."}`)
    }
  }
  if (!result.features.length) throw new Error(["Tidak ada fitur geografis valid yang dapat dimuat.", ...result.warnings].join(" "))
  return result
}
