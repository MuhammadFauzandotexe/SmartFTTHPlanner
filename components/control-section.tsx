"use client"

import type { ReactNode } from "react"
import { ChevronDown } from "lucide-react"

type Props = {
  title: string
  icon?: ReactNode
  caption?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

export function ControlSection({ title, icon, caption, open, onOpenChange, children }: Props) {
  return <details aria-label={title} open={open} onToggle={event => {
    if (event.currentTarget.open !== open) onOpenChange(event.currentTarget.open)
  }} className="control-section rounded-lg border bg-white">
    <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-3 text-xs font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-emerald-600">
      {icon}<span className="min-w-0 flex-1">{title}</span>{caption && <span className="shrink-0 text-[10px] font-normal text-slate-400">{caption}</span>}<ChevronDown className="control-section-chevron size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
    </summary>
    <div className="space-y-3 border-t p-3">{children}</div>
  </details>
}
