"use client"

import { useEffect, useState } from "react"
import { defaultLayerSettings, normalizeLayerSettings, SETTINGS_KEY } from "@/lib/layer-settings"

export function useLayerSettings() {
  const [settings, setSettings] = useState(defaultLayerSettings)
  const [ready, setReady] = useState(false)
  const [storageError, setStorageError] = useState(false)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY)
      if (saved) setSettings(normalizeLayerSettings(JSON.parse(saved)))
    } catch { setStorageError(true) }
    setReady(true)
  }, [])
  useEffect(() => {
    if (!ready) return
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); setStorageError(false) }
    catch { setStorageError(true) }
  }, [settings, ready])
  return { settings, setSettings, ready, storageError }
}
