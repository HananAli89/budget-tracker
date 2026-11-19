import { useSyncExternalStore } from 'react'

// Preferences, kept in localStorage (and included in backups).
export interface Settings {
  paydayAnchor: string        // any real payday; others are every 14 days from it
  sadaqaRate: number          // %
  startingPot: number         // cents already in the Bills pot when I started
  theme: 'system' | 'light' | 'dark'
  dateFormat: 'YYYY-MM-DD' | 'DD/MM/YYYY'
}

const KEY = 'bt-settings'
export const DEFAULTS: Settings = {
  paydayAnchor: '2026-11-12',
  sadaqaRate: 2.5,
  startingPot: 0,
  theme: 'system',
  dateFormat: 'YYYY-MM-DD',
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

let current = load()
const listeners = new Set<() => void>()

export const getSettings = () => current

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(current)) } catch { /* storage unavailable */ }
  listeners.forEach((l) => l())
}

export function useSettings(): Settings {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb) }, () => current)
}
