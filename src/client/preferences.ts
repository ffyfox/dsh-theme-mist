/**
 * Durable client-side preferences.
 *
 * v1 stores them in `localStorage` (see docs/decisions/0002-preference-storage.md);
 * v2 will move to Host settings and migrate once. Everything here is defensive on
 * purpose: a theme must never be the reason a page throws.
 *
 * Rules:
 *  - unknown accent id  → fall back to the default, silently
 *  - malformed JSON     → fall back to the default, never throw
 *  - storage blocked    → keep an in-memory copy so the session still works
 */
import { isAccentId } from './state.ts'
import type { AccentId } from './palettes.ts'

/** Everything this plugin persists today. */
export interface GoThemePreferences {
  readonly accent: AccentId
  /** Reserved for the material layer (T2): "reduce transparency" switch. */
  readonly reduceMaterial: boolean
}

/** Versioned key: a future schema change bumps the suffix instead of migrating in place. */
export const PREFERENCES_KEY = 'dsh.go-theme.preferences.v1'

/** Values used when nothing is stored, or when the stored value is unusable. */
export const DEFAULT_PREFERENCES: GoThemePreferences = Object.freeze({
  accent: 'mist',
  reduceMaterial: false,
})

/** The slice of the Web Storage API this module needs. */
export interface PreferenceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Last written value; only consulted when real storage is unavailable. */
let memory: GoThemePreferences | null = null

let warned = false

/** Warn once per session — a blocked storage must not spam the console. */
function warnOnce(reason: string): void {
  if (warned) return
  warned = true
  console.warn('[ui-theme-go] preference storage unavailable; using in-memory state:', reason)
}

/**
 * Resolve `localStorage`, or undefined when it is missing or unusable.
 *
 * Private-mode browsers expose the object but throw on the first write, so a
 * probe write is the only reliable check.
 */
function defaultStorage(): PreferenceStorage | undefined {
  try {
    const candidate = (globalThis as { localStorage?: PreferenceStorage }).localStorage
    if (candidate === undefined || candidate === null) return undefined
    const probe = '__dsh_go_theme_probe__'
    candidate.setItem(probe, '1')
    candidate.setItem(probe, '0')
    return candidate
  } catch {
    return undefined
  }
}

/**
 * Decode a stored string.
 * @param raw - whatever `getItem` returned, or any untrusted value.
 * @returns a complete preference object; never throws.
 */
export function parsePreferences(raw: unknown): GoThemePreferences {
  if (typeof raw !== 'string' || raw === '') return DEFAULT_PREFERENCES
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return DEFAULT_PREFERENCES
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return DEFAULT_PREFERENCES
  const record = parsed as Record<string, unknown>
  return {
    accent: isAccentId(record.accent) ? record.accent : DEFAULT_PREFERENCES.accent,
    reduceMaterial:
      typeof record.reduceMaterial === 'boolean' ? record.reduceMaterial : DEFAULT_PREFERENCES.reduceMaterial,
  }
}

/**
 * Read the stored preferences.
 * @param storage - injectable for tests; defaults to `localStorage`.
 * @returns stored or default preferences; never throws.
 */
export function loadPreferences(storage?: PreferenceStorage): GoThemePreferences {
  const store = storage ?? defaultStorage()
  if (store === undefined) {
    warnOnce('localStorage is not available')
    return memory ?? DEFAULT_PREFERENCES
  }
  try {
    const raw = store.getItem(PREFERENCES_KEY)
    return raw === null ? DEFAULT_PREFERENCES : parsePreferences(raw)
  } catch (error) {
    warnOnce(String(error))
    return memory ?? DEFAULT_PREFERENCES
  }
}

/**
 * Persist the preferences.
 *
 * The in-memory copy is always updated first, so a blocked or full storage still
 * leaves the current session consistent.
 * @param preferences - complete object; partial writes are not supported.
 * @param storage - injectable for tests; defaults to `localStorage`.
 * @returns true when the value reached real storage.
 */
export function savePreferences(preferences: GoThemePreferences, storage?: PreferenceStorage): boolean {
  memory = preferences
  const store = storage ?? defaultStorage()
  if (store === undefined) {
    warnOnce('localStorage is not available')
    return false
  }
  try {
    store.setItem(PREFERENCES_KEY, JSON.stringify(preferences))
    return true
  } catch (error) {
    warnOnce(String(error))
    return false
  }
}

/**
 * Read-merge-write for one field.
 * @param patch - fields to change.
 * @param storage - injectable for tests.
 * @returns the merged preferences.
 */
export function updatePreferences(
  patch: Partial<GoThemePreferences>,
  storage?: PreferenceStorage,
): GoThemePreferences {
  const next: GoThemePreferences = { ...loadPreferences(storage), ...patch }
  savePreferences(next, storage)
  return next
}
