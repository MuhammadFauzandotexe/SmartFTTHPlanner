"use client"

import { useCallback, useRef, useState } from "react"
import { appendLogEntries, initialLogMessages, type LogEntry, type LogInput } from "@/lib/application-log"

export function useApplicationLog() {
  const [entries, setEntries] = useState<LogEntry[]>(() => initialLogMessages().map((message, index) => ({ ...message, id: `log-${index + 1}`, createdAt: new Date().toISOString() })))
  const sequence = useRef(initialLogMessages().length)
  const addLogs = useCallback((messages: readonly LogInput[]) => {
    const now = new Date().toISOString()
    const incoming = messages.map(message => ({ ...message, id: `log-${++sequence.current}`, createdAt: now }))
    setEntries(previous => appendLogEntries(previous, incoming))
  }, [])
  return { entries, addLogs }
}
