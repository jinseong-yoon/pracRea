import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import type { DeepPartial, Settings } from '../shared/types'

// Defaults. Every leaf is wrapped in { value } like the original app's settings object.
export const DEFAULT_SETTINGS: Settings = {
  desktop: {
    theme: { value: 'system' },
    showStoppedContainers: { value: true }
  },
  containers: {
    statsIntervalSeconds: { value: 10 },
    logTailLines: { value: 200 }
  }
}

type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

function merge(base: Json, patch: Json): Json {
  const out: Json = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    out[k] = isObj(v) && isObj(base[k]) ? merge(base[k] as Json, v) : v
  }
  return out
}

const file = (): string => join(app.getPath('userData'), 'settings.json')

let cache: Settings | null = null

export function getSettings(): Settings {
  if (cache) return cache
  let stored: Json = {}
  try {
    stored = JSON.parse(readFileSync(file(), 'utf8'))
  } catch {
    /* first run or unreadable file: use defaults */
  }
  cache = merge(DEFAULT_SETTINGS as unknown as Json, stored) as unknown as Settings
  return cache
}

const listeners = new Set<(s: Settings) => void>()
export const onSettingsChanged = (cb: (s: Settings) => void): void => {
  listeners.add(cb)
}

function validate(s: Settings): void {
  const iv = s.containers.statsIntervalSeconds.value
  if (!Number.isFinite(iv) || iv < 2 || iv > 300) throw new Error('statsIntervalSeconds must be between 2 and 300')
  const tail = s.containers.logTailLines.value
  if (!Number.isInteger(tail) || tail < 0 || tail > 100000) throw new Error('logTailLines must be 0..100000')
  if (!['system', 'light', 'dark'].includes(s.desktop.theme.value)) throw new Error('invalid theme')
}

export function updateSettings(patch: DeepPartial<Settings>): Settings {
  const next = merge(getSettings() as unknown as Json, patch as Json) as unknown as Settings
  validate(next)
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(file(), JSON.stringify(next, null, 2))
  cache = next
  listeners.forEach((cb) => cb(next))
  return next
}
