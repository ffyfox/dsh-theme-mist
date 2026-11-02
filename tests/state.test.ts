/**
 * Accent order walking, used by the picker's arrow keys.
 *
 * The same list drives both the rendered order and the keyboard step, so the
 * cases worth pinning are the two wraps and the identity.
 */
import { describe, expect, it } from 'vitest'
import { ACCENT_IDS } from '../src/client/palettes.ts'
import { stepAccent } from '../src/client/state.ts'

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
