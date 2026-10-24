"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, AlertTriangle, CircleAlert, Info, Terminal, ChevronDown, ChevronUp } from "lucide-react"
import { countLogLevels, type LogEntry, type LogLevel } from "@/lib/application-log"

const levels = {
  info: { label: "Info", icon: Info, color: "text-blue-600", badge: "bg-blue-50 text-blue-700" },
  success: { label: "Success", icon: CheckCircle2, color: "text-emerald-600", badge: "bg-emerald-50 text-emerald-700" },
  warning: { label: "Warning", icon: AlertTriangle, color: "text-amber-600", badge: "bg-amber-50 text-amber-800" },
  error: { label: "Error", icon: CircleAlert, color: "text-red-600", badge: "bg-red-50 text-red-700" },
} as const

export function ApplicationLog({ entries }: { entries: LogEntry[] }) {
  const [open, setOpen] = useState(false)
  const counts = useMemo(() => countLogLevels(entries), [entries])
  const last = entries[entries.length - 1]
  return <section aria-label="Log aplikasi" className="z-[800] shrink-0 border-t bg-white text-slate-800">
    <button type="button" aria-expanded={open} aria-controls="application-log-body" title={open ? "Sembunyikan log aplikasi" : "Tampilkan log aplikasi"} onClick={() => setOpen(value => !value)} className="flex min-h-10 w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-emerald-600">
      <span className="flex items-center gap-2"><Terminal className="size-4 text-slate-500" aria-hidden="true" /><span className="font-semibold">Log aplikasi</span><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{entries.length}</span></span>
      <span className="flex items-center gap-2">{(["success", "warning", "error", "info"] as LogLevel[]).map(level => {
        const item = levels[level]
        const Icon = item.icon
        return <span key={level} title={`${counts[level]} log ${item.label}`} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${item.badge}`}><Icon className="size-3.5" aria-hidden="true" /><span>{counts[level]}</span><span className="sr-only">{item.label}</span></span>
      })}{open ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronUp className="size-4" aria-hidden="true" />}</span>
    </button>
    <span className="sr-only" role="status" aria-live="polite">{last ? `Log terbaru: ${levels[last.level].label}. ${last.title}` : "Belum ada log."}</span>
    {open && <div id="application-log-body" className="h-[min(32vh,280px)] overflow-y-auto border-t bg-slate-50 px-3 py-2" onKeyDown={event => { if (event.key === "Escape") { setOpen(false); document.querySelector<HTMLButtonElement>('[aria-controls="application-log-body"]')?.focus() } }}>
      <ol className="space-y-1.5">{[...entries].reverse().map(entry => {
        const item = levels[entry.level]
        const Icon = item.icon
        return <li key={entry.id}><details className="group rounded-lg border bg-white">
          <summary className="flex cursor-pointer list-none items-center gap-2 p-2 text-xs focus-visible:outline-2 focus-visible:outline-emerald-600"><Icon className={`size-4 shrink-0 ${item.color}`} aria-hidden="true" /><span className="sr-only">{item.label}</span><time dateTime={entry.createdAt} className="hidden shrink-0 text-[10px] tabular-nums text-slate-400 sm:inline">{new Date(entry.createdAt).toLocaleTimeString("id-ID", { hour12: false })}</time><span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{entry.source}</span><span className="min-w-0 flex-1 truncate" title={entry.title}>{entry.title}</span><span className="shrink-0 text-[10px] text-slate-500"><span className="group-open:hidden">Detail</span><span className="hidden group-open:inline">Tutup detail</span></span><ChevronDown className="size-3.5 shrink-0 text-slate-400 group-open:rotate-180" aria-hidden="true" /></summary>
          <div className="border-t px-3 py-2"><p className="mb-2 break-words text-xs font-medium">{entry.title}</p><dl className="space-y-2 text-[11px]">{entry.details.map((detail, index) => <div key={index} className="grid gap-0.5 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-3"><dt className="font-medium text-slate-500">{detail.label}</dt><dd className="min-w-0 whitespace-pre-wrap break-words text-slate-700">{detail.value}</dd></div>)}</dl></div>
        </details></li>
      })}</ol>
    </div>}
  </section>
}
