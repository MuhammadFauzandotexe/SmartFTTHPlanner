/** Metadata is resolved only against XML already present in the selected file. */
export type MetadataWarning = {
  kmlFile: string
  schemaUrl: string
  features: { name: string; id: string }[]
}
export type KmlDocument = { name: string; doc: Document }

function descendants(node: Document | Element, name: string): Element[] {
  return Array.from(node.getElementsByTagNameNS("*", name))
}

function resolveSchema(reference: string, source: KmlDocument, documents: KmlDocument[]): Element | undefined {
  if (!reference || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(reference)) return undefined
  try {
    // URL is used only to normalize embedded paths/fragments, never to fetch.
    const base = new URL(source.name, "https://kmz.invalid/")
    const target = new URL(reference, base)
    if (target.origin !== base.origin || !target.hash) return undefined
    const document = documents.find(candidate => new URL(candidate.name, base.origin + "/").pathname === target.pathname)
    const id = decodeURIComponent(target.hash.slice(1))
    return document && descendants(document.doc, "Schema").find(schema => schema.getAttribute("id") === id)
  } catch { return undefined }
}

function declaredValue(raw: string, type: string | null): string | number | boolean {
  // Coercion requires an explicit, matching SimpleField definition. Unknown or
  // invalid typed values remain untouched strings (including leading zeros).
  if (type === "bool") {
    if (raw === "1" || raw === "true") return true
    if (raw === "0" || raw === "false") return false
  }
  if (["int", "uint", "short", "ushort"].includes(type || "") && /^[+-]?\d+$/.test(raw)) {
    const n = Number(raw)
    const limits: Record<string, [number, number]> = { int: [-2147483648, 2147483647], uint: [0, 4294967295], short: [-32768, 32767], ushort: [0, 65535] }
    const [min, max] = limits[type!]
    if (Number.isSafeInteger(n) && n >= min && n <= max) return n
  }
  if ((type === "float" || type === "double") && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)) {
    const n = Number(raw)
    if (Number.isFinite(n)) return n
  }
  return raw
}

export function readSchemaData(
  placemark: Element,
  source: KmlDocument,
  documents: KmlDocument[],
  feature: { name: string; id: string },
  warnings: MetadataWarning[],
): Record<string, string | number | boolean> {
  const entries: [string, string | number | boolean][] = []
  for (const extended of descendants(placemark, "ExtendedData")) {
    for (const data of descendants(extended, "SchemaData")) {
      const schemaUrl = data.getAttribute("schemaUrl") || ""
      const schema = resolveSchema(schemaUrl, source, documents)
      if (!schema) {
        let group = warnings.find(w => w.kmlFile === source.name && w.schemaUrl === schemaUrl)
        if (!group) {
          group = { kmlFile: source.name, schemaUrl, features: [] }
          warnings.push(group)
        }
        if (!group.features.includes(feature)) group.features.push(feature)
      }
      for (const value of descendants(data, "SimpleData")) {
        const name = value.getAttribute("name")
        if (name === null) continue
        const field = schema && descendants(schema, "SimpleField").find(f => f.getAttribute("name") === name)
        entries.push([name, declaredValue(value.textContent || "", field?.getAttribute("type") || null)])
      }
    }
  }
  return Object.fromEntries(entries)
}
