/**
 * Accent selection state.
 *
 * Kept out of `index.ts` so the settings UI (T3) can drive the same module
 * without going through the DOM. The store is intentionally tiny: one value,
 * one listener set, no framework.
 */
import { ACCENT_IDS, type AccentId } from './palettes.ts'

/** Accent used before any preference is read (and the fallback for bad input). */
export const DEFAULT_ACCENT: AccentId = 'mist'

/**
 * Custom event on `window` for driving the theme from outside the bundle —
 * user scripts, other plugins, and the e2e harness. Detail is an accent id;
 * unknown values are ignored rather than throwing.
 */
export const ACCENT_EVENT = 'dsh-go-theme:accent'

/**
 * Custom event on `window` for the "reduce transparency" switch. Detail is a
 * boolean; anything else is ignored. Until the settings UI (T3.4) exists this
 * is the only way to drive the switch, which is also what the e2e uses.
 */
export const REDUCE_EVENT = 'dsh-go-theme:reduce-material'

let current: AccentId = DEFAULT_ACCENT
const listeners = new Set<(accent: AccentId) => void>()
let reduceMaterial = false
const reduceListeners = new Set<(reduce: boolean) => void>()

/**
 * Narrow an unknown value to an accent id.
 * @param value - anything, typically `event.detail` or a stored string.
 */
export function isAccentId(value: unknown): value is AccentId {
  return typeof value === 'string' && (ACCENT_IDS as readonly string[]).includes(value)
}

/** The accent currently applied. */
export function getAccent(): AccentId {
  return current
}

/**
 * Select an accent and notify listeners.
 * @param next - candidate accent id; invalid values and no-ops are ignored.
 * @returns true when the value actually changed.
 */
export function setAccent(next: unknown): boolean {
  if (!isAccentId(next) || next === current) return false
  current = next
  for (const listener of [...listeners]) listener(current)
  return true
}

/**
 * Observe accent changes.
 * @param listener - called after `current` has already been updated.
 * @returns unsubscribe function.
 */
export function subscribeAccent(listener: (accent: AccentId) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Walk the accent order by `delta` positions, wrapping at both ends.
 *
 * The picker's arrow keys and the order the row renders come from the same
 * source ({@link ACCENT_IDS}), so this stays correct if the list ever changes.
 * @param from - current accent; an unknown value is treated as the first.
 * @param delta - positions to move; negative walks backwards.
 * @returns the accent reached.
 */
export function stepAccent(from: AccentId, delta: number): AccentId {
  const size = ACCENT_IDS.length
  const start = ACCENT_IDS.indexOf(from)
  const base = start < 0 ? 0 : start
  return ACCENT_IDS[((base + delta) % size + size) % size]
}

/** Whether the material layer is degraded to opaque surfaces. */
export function getReduceMaterial(): boolean {
  return reduceMaterial
}

/**
 * Turn the material layer's transparency down or back on.
 * @param next - candidate value; non-booleans and no-ops are ignored.
 * @returns true when the value actually changed.
 */
export function setReduceMaterial(next: unknown): boolean {
  if (typeof next !== 'boolean' || next === reduceMaterial) return false
  reduceMaterial = next
  for (const listener of [...reduceListeners]) listener(reduceMaterial)
  return true
}

/**
 * Observe "reduce transparency" changes.
 * @param listener - called after `reduceMaterial` has already been updated.
 * @returns unsubscribe function.
 */
export function subscribeReduceMaterial(listener: (reduce: boolean) => void): () => void {
  reduceListeners.add(listener)
  return () => {
    reduceListeners.delete(listener)
  }
}
