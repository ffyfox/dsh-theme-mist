/**
 * Locale dictionaries for the settings row.
 *
 * The row's copy lives in a namespace, but the six accent names also exist as
 * `PALETTES[id].label` (a per-palette pair with no notion of the active
 * language). Those two sources must agree, or the picker would name an accent
 * differently from every other place the palette is described — hence the pin
 * below. The official `check:i18n` rule is mirrored too: no zero-width space
 * and no byte-order mark in any string.
 */
import { describe, expect, it } from 'vitest'
import { ACCENT_IDS, PALETTES } from '../src/client/palettes.ts'
import { SETTINGS_NS, en, zh, type StringKey } from '../src/client/strings.ts'

/** Locales that must both be present for registration to succeed. */
const DICTIONARIES = { zh, en } as const

describe('settings dictionaries', () => {
  it('declares a stable namespace', () => {
    expect(SETTINGS_NS).toBe('dsh-go-theme')
  })

  it('covers exactly the same keys in every locale', () => {
    const reference = Object.keys(zh).sort()
    for (const [locale, dictionary] of Object.entries(DICTIONARIES)) {
      expect(Object.keys(dictionary).sort(), locale).toEqual(reference)
    }
  })

  it('has a title and one name per accent, plus the sidebar copy', () => {
    const expected: StringKey[] = [
      'accent.title',
      ...ACCENT_IDS.map((id): StringKey => `accent.${id}`),
      'sidebar.title',
      'sidebar.sheet',
      'sidebar.flat',
    ]
    expect(Object.keys(zh).sort()).toEqual([...expected].sort())
  })

  it('names every accent the way its palette does', () => {
    for (const id of ACCENT_IDS) {
      const key = `accent.${id}` as StringKey
      expect(zh[key], `zh ${id}`).toBe(PALETTES[id].label.zh)
      expect(en[key], `en ${id}`).toBe(PALETTES[id].label.en)
    }
  })

  it('contains no zero-width space or byte-order mark', () => {
    for (const [locale, dictionary] of Object.entries(DICTIONARIES)) {
      for (const [key, value] of Object.entries(dictionary)) {
        expect(value, `${locale} ${key}`).not.toMatch(/[\u200B\uFEFF]/)
      }
    }
  })
})
