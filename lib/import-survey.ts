import JSZip from "jszip"
import { kml } from "@tmcw/togeojson"
import { readSchemaData, type KmlDocument, type MetadataWarning } from "./kml-metadata"
import { firstPosition, parseCategory, validGeometry, type FeatureItem } from "./survey"

export type ImportResult = {
  features: FeatureItem[]
  warnings: string[]
  metadataWarnings: MetadataWarning[]
  geometryWarnings: string[]
}
export class ImportSurveyError extends Error {
  constructor(message: string, public result: ImportResult) { super(message); this.name = "ImportSurveyError" }
}

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

  const result: ImportResult = { features: [], warnings: [], metadataWarnings: [], geometryWarnings: [] }
  const documents: KmlDocument[] = []
  const batchId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  for (const entry of entries) {
    try {
      const doc = new DOMParser().parseFromString(await entry.text(), "application/xml")
      if (doc.getElementsByTagName("parsererror").length || doc.documentElement.localName !== "kml") {
        throw new Error("XML KML tidak valid.")
      }
      documents.push({ name: entry.name, doc })
    } catch (error) {
      result.warnings.push(`${entry.name}: ${error instanceof Error ? error.message : "Gagal membaca KML."}`)
    }
  }
  for (const source of documents) {
    const { doc } = source
    const entry = { name: source.name }
    try {
      if (doc.getElementsByTagNameNS("*", "NetworkLink").length) {
        result.warnings.push(`${entry.name}: NetworkLink eksternal tidak dimuat.`)
      }
      if (doc.getElementsByTagNameNS("*", "GroundOverlay").length) {
        result.warnings.push(`${entry.name}: gambar GroundOverlay tidak ditampilkan.`)
      }
      let skipped = 0
      // Parse SchemaData ourselves from the untouched source XML. The converter
      // uses a global field-name map, and even throws for names like __proto__.
      // Exclude it only from a conversion clone, then merge every original
      // attribute back below; geometry and the source document are untouched.
      const conversionDoc = doc.cloneNode(true) as Document
      for (const schemaData of Array.from(conversionDoc.getElementsByTagNameNS("*", "SchemaData"))) {
        schemaData.parentNode?.removeChild(schemaData)
      }
      const converted = kml(conversionDoc)
      // togeojson 7.1.3 yields these element types in this order, including
      // features with null geometry. Regression tests protect this association.
      const sourceFeatures = ["Placemark", "GroundOverlay", "NetworkLink"]
        .flatMap(tag => Array.from(doc.getElementsByTagName(tag)))
      converted.features.forEach((feature, index) => {
        const internalId = `${batchId}-${entry.name}-${index}`
        const convertedProps = feature.properties || {}
        const xmlName = Array.from(sourceFeatures[index]?.childNodes || []).find(node => node.nodeType === 1 && node.nodeName.split(":").pop() === "name")?.textContent
        const name = String(xmlName || convertedProps.name || `Fitur ${index + 1}`)
        const attributes = sourceFeatures[index] ? readSchemaData(sourceFeatures[index], source, documents,
          { name, id: String(feature.id ?? internalId) }, result.metadataWarnings) : {}
        const props = { ...convertedProps, ...attributes }
        if (!validGeometry(feature.geometry)) { skipped++; return }
        const geometry = feature.geometry
        const position = firstPosition(geometry)
        result.features.push({
          id: internalId,
          name, category: parseCategory(name, geometry), file: file.name, kmlFile: entry.name,
          kind: geometry.type, geometry, coords: [position[1], position[0]],
          description: typeof props.description === "string" ? props.description : undefined,
          props: { ...(feature.id !== undefined ? { originalId: feature.id } : {}), ...props },
        })
      })
      if (skipped) result.geometryWarnings.push(`${entry.name}: ${skipped} fitur tanpa geometri atau dengan koordinat/geometri tidak valid dilewati.`)
    } catch (error) {
      result.warnings.push(`${entry.name}: ${error instanceof Error ? error.message : "Gagal membaca KML."}`)
    }
  }
  if (!result.features.length) throw new ImportSurveyError(["Tidak ada fitur geografis valid yang dapat dimuat.", ...result.warnings].join(" "), result)
  return result
}
