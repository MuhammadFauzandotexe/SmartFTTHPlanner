export type PixelBox = { left: number; top: number; right: number; bottom: number }
export type LabelCandidate = { id: string; x: number; y: number; width: number; height: number }

// A fresh layout per snapshot: never retain labels from an earlier generation.
// Grid buckets bound collision work in dense surveys without moving anchors.
export function visibleDropLabels(candidates: LabelCandidate[], size: { x: number; y: number }, selectedId?: string, obstacles: PixelBox[] = []): Set<string> {
  const buckets = new Map<string, PixelBox[]>()
  const cells = (box: PixelBox) => {
    const keys: string[] = []
    for (let x = Math.floor(box.left / 96); x <= Math.floor(box.right / 96); x++)
      for (let y = Math.floor(box.top / 32); y <= Math.floor(box.bottom / 32); y++) keys.push(`${x}:${y}`)
    return keys
  }
  const occupy = (box: PixelBox) => {
    for (const key of cells(box)) {
      const list = buckets.get(key) ?? []
      list.push(box)
      buckets.set(key, list)
    }
  }
  obstacles.forEach(occupy)
  const visible = new Set<string>()
  const ordered = [...candidates].sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId) || a.id.localeCompare(b.id))
  for (const label of ordered) {
    if (visible.has(label.id)) continue
    const box = { left: label.x - label.width / 2 - 3, right: label.x + label.width / 2 + 3, top: label.y - label.height / 2 - 3, bottom: label.y + label.height / 2 + 3 }
    if (box.right < 0 || box.left > size.x || box.bottom < 0 || box.top > size.y) continue
    const collision = cells(box).some(key => buckets.get(key)?.some(other => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top))
    if (label.id !== selectedId && collision) continue
    visible.add(label.id)
    occupy(box)
  }
  return visible
}
