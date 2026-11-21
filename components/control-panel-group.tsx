"use client"

import { useId, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"

export default function ControlPanelGroup({ title, icon, summary, open, onToggle, children }: {
  title: string; icon: ReactNode; summary?: string; open: boolean; onToggle: () => void; children: ReactNode
}) {
  const id = useId()
  return <section hidden={!open} className="shrink-0 overflow-hidden rounded-lg border bg-white">
    <button id={`${id}-trigger`} type="button" aria-expanded={open} aria-controls={id} onClick={onToggle}
      className="flex w-full items-center gap-2 px-3 py-3 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-emerald-600">
      <span className="text-slate-400 [&_svg]:size-4">{icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-xs font-semibold">{title}</span>{summary && <span className="mt-0.5 block truncate text-[10px] text-slate-400">{summary}</span>}</span>
      <ChevronDown className={`size-3.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    <div id={id} role="region" aria-labelledby={`${id}-trigger`} hidden={!open} className="border-t p-3">{children}</div>
  </section>
}
