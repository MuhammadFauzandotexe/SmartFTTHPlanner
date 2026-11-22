import { distance } from "@turf/turf"
import type { AssignmentProject } from "./manual-assignments"
import type { FeatureItem } from "./import-survey"
export const projectFdts = (project: AssignmentProject) => project.features.filter(f => f.category === "FDT" && f.geometry.type === "Point")
export function mountingPole(project: AssignmentProject, fdt: FeatureItem): string | null {
  if (fdt.mountingPoleId) return fdt.mountingPoleId
  // Exact coincidence only; proximity never establishes mounting suitability.
  return project.features.find(p => p.category === "Tiang" && p.geometry.type === "Point" && distance(p.geometry.coordinates, fdt.geometry.type === "Point" ? fdt.geometry.coordinates : [], { units: "meters" }) === 0)?.id ?? null
}
export function placeFdt(project: AssignmentProject, fdtId: string | null, poleId: string, newId: string): AssignmentProject {
  const pole = project.features.find(p => p.id === poleId && p.category === "Tiang" && p.geometry.type === "Point")
  if (!pole || pole.geometry.type !== "Point") throw new Error("Tiang tujuan tidak tersedia. Pilih tiang lain.")
  const existing = fdtId ? projectFdts(project).find(f => f.id === fdtId) : null
  if (fdtId && !existing) throw new Error("FDT yang dipindahkan tidak tersedia. Pilih perangkat kembali.")
  if (!fdtId && projectFdts(project).length) throw new Error("FDT sudah tersedia. Batalkan dan pilih FDT yang akan dipindahkan.")
  if (existing && mountingPole(project, existing) === poleId) throw new Error("Tiang ini adalah lokasi FDT saat ini; tidak ada perubahan.")
  if (!existing && project.features.some(f => f.id === newId)) throw new Error("ID FDT sudah digunakan")
  const id = existing?.id ?? newId
  const updated: FeatureItem = { ...(existing ?? { id, name: `FDT-${newId.slice(0, 8)}`, category: "FDT" as const, kind: "Point" as const, file: "Perencanaan manual" }), mountingPoleId: pole.id, coords: [pole.geometry.coordinates[1], pole.geometry.coordinates[0]], geometry: { type: "Point", coordinates: [...pole.geometry.coordinates] } }
  return { ...project, features: existing ? project.features.map(f => f.id === id ? updated : f) : [...project.features, updated], distributionStaleFdtIds: [...new Set([...(project.distributionStaleFdtIds ?? []), id])], revision: project.revision + 1 }
}
