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

let current: AccentId = DEFAULT_ACCENT
const listeners = new Set<(accent: AccentId) => void>()

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

/**
 * Sidebar material (T5.8).
 *
 * `sheet` is DSH Go's drawer glass: the sheet tier's fill, hairline, rim and the
 * radius on its right-hand corners (T5.7-A). `flat` paints the page through the
 * column and keeps only a hairline — the way upstream draws its detail panel on
 * the other side (T5.7-B). The two differ in exactly one thing, whether the
 * column paints the sheet token, which is why this is a preference rather than a
 * second theme.
 */
export type SidebarMaterial = 'sheet' | 'flat'

/** Every accepted value, in the order the settings row renders them. */
export const SIDEBAR_MATERIALS: readonly SidebarMaterial[] = ['sheet', 'flat']

/**
 * Custom event on `window` for the sidebar material. Detail is a material id;
 * unknown values are ignored rather than throwing.
 */
export const SIDEBAR_EVENT = 'dsh-go-theme:sidebar-material'

let sidebarMaterial: SidebarMaterial = 'sheet'
const sidebarListeners = new Set<(material: SidebarMaterial) => void>()

/**
 * Narrow an unknown value to a sidebar material id.
 * @param value - anything, typically `event.detail` or a stored string.
 */
export function isSidebarMaterial(value: unknown): value is SidebarMaterial {
  return typeof value === 'string' && (SIDEBAR_MATERIALS as readonly string[]).includes(value)
}

/** The sidebar material currently applied. */
export function getSidebarMaterial(): SidebarMaterial {
  return sidebarMaterial
}

/**
 * Select a sidebar material and notify listeners.
 * @param next - candidate id; invalid values and no-ops are ignored.
 * @returns true when the value actually changed.
 */
export function setSidebarMaterial(next: unknown): boolean {
  if (!isSidebarMaterial(next) || next === sidebarMaterial) return false
  sidebarMaterial = next
  for (const listener of [...sidebarListeners]) listener(sidebarMaterial)
  return true
}

/**
 * Observe sidebar material changes.
 * @param listener - called after `sidebarMaterial` has already been updated.
 * @returns unsubscribe function.
 */
export function subscribeSidebarMaterial(listener: (material: SidebarMaterial) => void): () => void {
  sidebarListeners.add(listener)
  return () => {
    sidebarListeners.delete(listener)
  }
}
