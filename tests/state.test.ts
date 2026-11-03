/**
 * Accent order walking, used by the picker's arrow keys.
 *
 * The same list drives both the rendered order and the keyboard step, so the
 * cases worth pinning are the two wraps and the identity.
 */
import { describe, expect, it } from 'vitest'
import { ACCENT_IDS } from '../src/client/palettes.ts'
import {
  getSidebarMaterial,
  isSidebarMaterial,
  setSidebarMaterial,
  stepAccent,
  subscribeSidebarMaterial,
} from '../src/client/state.ts'

describe('stepAccent', () => {
  it('walks forward through the declared order', () => {
    expect(stepAccent('mist', 1)).toBe('daiqing')
    expect(stepAccent('dusk', 1)).toBe('turquoise')
  })

  it('walks backward', () => {
    expect(stepAccent('daiqing', -1)).toBe('mist')
    expect(stepAccent('graphite', -3)).toBe('dusk')
  })

  it('wraps at both ends', () => {
    expect(stepAccent(ACCENT_IDS[ACCENT_IDS.length - 1], 1)).toBe(ACCENT_IDS[0])
    expect(stepAccent(ACCENT_IDS[0], -1)).toBe(ACCENT_IDS[ACCENT_IDS.length - 1])
  })

  it('is an identity for zero', () => {
    for (const id of ACCENT_IDS) expect(stepAccent(id, 0), id).toBe(id)
  })

  it('always returns a known accent', () => {
    for (const id of ACCENT_IDS) {
      for (const delta of [-13, -7, -1, 1, 7, 13]) {
        expect(ACCENT_IDS).toContain(stepAccent(id, delta))
      }
    }
  })
})

describe('sidebar material', () => {
  it('starts at the upstream-faithful value and only accepts the two ids', () => {
    expect(getSidebarMaterial()).toBe('sheet')
    for (const bad of ['', 'Sheet', 'glass', null, undefined, 0, {}, []]) {
      expect(isSidebarMaterial(bad), String(bad)).toBe(false)
      expect(setSidebarMaterial(bad)).toBe(false)
    }
    expect(getSidebarMaterial()).toBe('sheet')
  })

  it('notifies listeners once per real change and stops after unsubscribe', () => {
    const seen: string[] = []
    const unsubscribe = subscribeSidebarMaterial((material) => { seen.push(material) })
    expect(setSidebarMaterial('flat')).toBe(true)
    expect(setSidebarMaterial('flat')).toBe(false)
    unsubscribe()
    expect(setSidebarMaterial('sheet')).toBe(true)
    expect(seen).toEqual(['flat'])
    expect(getSidebarMaterial()).toBe('sheet')
  })
})
