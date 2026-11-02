/**
 * Preference decoding and storage degradation.
 *
 * The theme must never be the reason a page throws, so every path through
 * `preferences.ts` is exercised with hostile input: corrupt JSON, wrong types,
 * unknown accents, and a storage object that throws on both ends.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_KEY,
  loadPreferences,
  parsePreferences,
  savePreferences,
  updatePreferences,
  type PreferenceStorage,
} from '../src/client/preferences.ts'

/** Minimal Map-backed Storage double. */
const makeStorage = (seed: Record<string, string> = {}): PreferenceStorage & { dump(): Record<string, string> } => {
  const data = new Map(Object.entries(seed))
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    dump: () => Object.fromEntries(data),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parsePreferences', () => {
  it('round-trips a valid payload', () => {
    expect(parsePreferences(JSON.stringify({ accent: 'dusk', reduceMaterial: true })))
      .toEqual({ accent: 'dusk', reduceMaterial: true })
  })

  it('falls back to the default accent for an unknown id', () => {
    expect(parsePreferences(JSON.stringify({ accent: 'neon', reduceMaterial: false })).accent)
      .toBe(DEFAULT_PREFERENCES.accent)
  })

  it('falls back to the default accent for a non-string accent', () => {
    expect(parsePreferences(JSON.stringify({ accent: 42 })).accent).toBe(DEFAULT_PREFERENCES.accent)
    expect(parsePreferences(JSON.stringify({ accent: null })).accent).toBe(DEFAULT_PREFERENCES.accent)
  })

  it('falls back to the default for reduceMaterial that is not a boolean', () => {
    expect(parsePreferences(JSON.stringify({ reduceMaterial: 'yes' })).reduceMaterial)
      .toBe(DEFAULT_PREFERENCES.reduceMaterial)
  })

  it('does not throw on malformed JSON', () => {
    for (const broken of ['{', 'not json', '{"accent":}', '[1,2,3]', 'null', '42', '"a string"', '']) {
      expect(() => parsePreferences(broken)).not.toThrow()
      expect(parsePreferences(broken)).toEqual(DEFAULT_PREFERENCES)
    }
  })

  it('fills missing fields from the defaults', () => {
    expect(parsePreferences('{}')).toEqual(DEFAULT_PREFERENCES)
    expect(parsePreferences(JSON.stringify({ accent: 'amber' })))
      .toEqual({ accent: 'amber', reduceMaterial: DEFAULT_PREFERENCES.reduceMaterial })
  })

  it('ignores unknown extra fields', () => {
    expect(parsePreferences(JSON.stringify({ accent: 'mist', reduceMaterial: false, extra: 1 })))
      .toEqual(DEFAULT_PREFERENCES)
  })

  it('accepts non-string input without throwing', () => {
    expect(parsePreferences(undefined)).toEqual(DEFAULT_PREFERENCES)
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES)
    expect(parsePreferences(42)).toEqual(DEFAULT_PREFERENCES)
  })
})

describe('load/save with working storage', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(loadPreferences(makeStorage())).toEqual(DEFAULT_PREFERENCES)
  })

  it('round-trips through the versioned key', () => {
    const storage = makeStorage()
    const prefs = { accent: 'turquoise', reduceMaterial: true } as const
    expect(savePreferences(prefs, storage)).toBe(true)
    expect(storage.dump()[PREFERENCES_KEY]).toBe(JSON.stringify(prefs))
    expect(loadPreferences(storage)).toEqual(prefs)
  })

  it('recovers from a corrupt stored value', () => {
    const storage = makeStorage({ [PREFERENCES_KEY]: '{"accent": "broken"' })
    expect(() => loadPreferences(storage)).not.toThrow()
    expect(loadPreferences(storage)).toEqual(DEFAULT_PREFERENCES)
  })

  it('merges one field without losing the others', () => {
    const storage = makeStorage({ [PREFERENCES_KEY]: JSON.stringify({ accent: 'amber', reduceMaterial: true }) })
    expect(updatePreferences({ accent: 'graphite' }, storage)).toEqual({ accent: 'graphite', reduceMaterial: true })
    expect(loadPreferences(storage)).toEqual({ accent: 'graphite', reduceMaterial: true })
  })
})

describe('degradation without usable storage', () => {
  it('keeps an in-memory copy when localStorage is missing', () => {
    vi.stubGlobal('localStorage', undefined)
    const prefs = { accent: 'dusk', reduceMaterial: true } as const
    expect(savePreferences(prefs)).toBe(false)
    expect(loadPreferences()).toEqual(prefs)
  })

  it('treats a localStorage that throws on write as unavailable (private mode)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })
    const prefs = { accent: 'amber', reduceMaterial: false } as const
    expect(savePreferences(prefs)).toBe(false)
    expect(loadPreferences()).toEqual(prefs)
  })

  it('does not throw when getItem throws', () => {
    const hostile: PreferenceStorage = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {},
    }
    expect(() => loadPreferences(hostile)).not.toThrow()
  })
})
