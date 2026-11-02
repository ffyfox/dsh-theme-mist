/**
 * Uninstall cleanliness audit (T4.4).
 *
 * A theme is a guest in a document it does not own, so "does it look right" is
 * the easy half. "Does it leave" is the half nobody notices until the next
 * plugin inherits a stray token — which is why the plan asks for four separate
 * assertions instead of one "unmount looks fine" screenshot:
 *
 *   1. token snapshot diff — every name the layer writes is back to the value it
 *      had before the plugin loaded, in the same priority;
 *   2. body attributes — the scope, accent and reduce-material markers are gone;
 *   3. style tags — the plugin injects none at runtime (its stylesheets ship in
 *      the bundle and are the host's to reclaim), so nothing may be left behind;
 *   4. own nodes — the plugin never appends an element, not even a wrapper.
 *
 * Two residues are deliberate and are asserted as such, not as leaks:
 *   - `localStorage['dsh.go-theme.preferences.v1']` survives, so plugging the
 *     theme back in restores the user's accent;
 *   - nothing else may survive, including the two window listeners.
 *
 * This harness is a fake document, so it cannot speak for the host's own
 * stylesheet reclamation or for the host theme's real disposer. Those are
 * measured in `tools/e2e-uninstall.mjs` against a live 0.2.1 instance; the
 * division of labour is the same as T4.2's unit test vs `e2e-degraded`.
 */
import type { Context } from '@deepseek-ai/cordis'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// `react` is answered by the shell's frozen module table at runtime and is not a
// dependency of this package, so the entry point cannot be imported without a
// stub. The settings rows never render here: the fake `slots.inject` never calls
// its callback.
vi.mock('react', () => ({
  useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get(),
}))
// The JSX runtime is imported by settings.tsx too; vitest runs the dev variant.
vi.mock('react/jsx-runtime', () => ({ jsx: () => null, jsxs: () => null, Fragment: 'Fragment' }))
vi.mock('react/jsx-dev-runtime', () => ({ jsxDEV: () => null, Fragment: 'Fragment' }))
// The stylesheets are build artefacts here (vitest would answer a .css import with
// a proxy that echoes the property name), so pin the one class the audit reads: the
// scoped root class the build puts on `<body>`.
vi.mock('../src/client/material.module.css', () => ({}))
vi.mock('../src/client/theme.module.css', () => ({ default: { root: 'x1y2z3_root' } }))
vi.mock('../src/client/settings.module.css', () => ({ default: {} }))

import { PREFERENCES_KEY } from '../src/client/preferences.ts'
import { apply } from '../src/client/index.ts'
import { setAccent, setReduceMaterial } from '../src/client/state.ts'
import { MATERIAL_VARS, TOKEN_NAMES, type TokenLayer } from '../src/client/tokens.ts'

/** Every name one layer writes: 34 official tokens + 9 material variables. */
const LAYER_NAMES = [...TOKEN_NAMES, ...MATERIAL_VARS] as const

/**
 * A fake element carrying the surface `apply()` touches: attributes, a class
 * list and an inline style map that keeps priority.
 *
 * Deliberately `any`: this is a probe object, and typing a fraction of the DOM
 * would make the assertions read worse than the thing they check.
 */
function fakeElement(tag: string): any {
  const attributes = new Map<string, string>()
  const classes = new Set<string>()
  const values = new Map<string, { value: string; priority: string }>()
  const style = {
    getPropertyValue: (name: string): string => values.get(name)?.value ?? '',
    getPropertyPriority: (name: string): string => values.get(name)?.priority ?? '',
    setProperty: (name: string, value: string, priority = ''): void => {
      values.set(name, { value, priority })
    },
    removeProperty: (name: string): void => {
      values.delete(name)
    },
    get length(): number {
      return values.size
    },
    [Symbol.iterator]: (): IterableIterator<string> => values.keys(),
  }
  return {
    tagName: tag.toUpperCase(),
    style,
    /** Raw maps, for the audit itself. */
    probe: { attributes, classes, values },
    getAttribute: (name: string): string | null => attributes.get(name) ?? null,
    hasAttribute: (name: string): boolean => attributes.has(name),
    setAttribute: (name: string, value: string): void => {
      attributes.set(name, value)
    },
    removeAttribute: (name: string): void => {
      attributes.delete(name)
    },
    classList: {
      add: (name: string): void => {
        classes.add(name)
      },
      remove: (name: string): void => {
        classes.delete(name)
      },
      contains: (name: string): boolean => classes.has(name),
      get length(): number {
        return classes.size
      },
    },
  }
}

/** The one method this plugin calls on the host theme service. */
interface HostTheme {
  overrideTokens(source: string, layer: TokenLayer): () => void
}

/**
 * A host theme that behaves like the real one where it matters: it writes each
 * token as the value resolved for the active scheme, remembers what was there
 * first, and puts it back from its disposer.
 *
 * The counters are the anti-stacking evidence — a second live layer would show
 * up as `maxLive === 2`, and a missing revert as `live !== 0` after teardown.
 */
function fakeHostTheme(body: any) {
  const live = new Map<string, number>()
  const stats = { writes: [] as string[], disposals: 0, maxLive: 0, live: 0 }
  const theme: HostTheme = {
    overrideTokens(source: string, layer: TokenLayer): () => void {
      const previous = new Map<string, [string, string]>()
      for (const [name, pair] of Object.entries(layer)) {
        previous.set(name, [
          body.style.getPropertyValue(name),
          body.style.getPropertyPriority(name),
        ])
        body.style.setProperty(name, pair.light)
      }
      live.set(source, (live.get(source) ?? 0) + 1)
      stats.writes.push(source)
      stats.live = [...live.values()].reduce((sum, count) => sum + count, 0)
      stats.maxLive = Math.max(stats.maxLive, stats.live)
      let done = false
      return () => {
        if (done) return
        done = true
        stats.disposals += 1
        live.set(source, (live.get(source) ?? 1) - 1)
        stats.live = [...live.values()].reduce((sum, count) => sum + count, 0)
        for (const [name, [value, priority]] of previous) {
          if (value === '') body.style.removeProperty(name)
          else body.style.setProperty(name, value, priority)
        }
      }
    },
  }
  return { theme, stats }
}

/** A document, a window and a storage, all recording what happens to them. */
function fakeEnvironment() {
  const body = fakeElement('body')
  const created: string[] = []
  const styleTags: unknown[] = []
  const head = {
    appendChild: (node: unknown): unknown => {
      styleTags.push(node)
      return node
    },
  }
  const document = {
    body,
    head,
    createElement: (tag: string) => {
      created.push(tag)
      return fakeElement(tag)
    },
    adoptedStyleSheets: [] as unknown[],
  }
  const listeners = new Map<string, Set<unknown>>()
  const window = {
    addEventListener: (type: string, listener: unknown): void => {
      const set = listeners.get(type) ?? new Set()
      set.add(listener)
      listeners.set(type, set)
    },
    removeEventListener: (type: string, listener: unknown): void => {
      listeners.get(type)?.delete(listener)
    },
    dispatchEvent: (event: { type: string }): boolean => {
      for (const listener of listeners.get(event.type) ?? []) {
        ;(listener as (event: unknown) => void)(event)
      }
      return true
    },
  }
  const storage = new Map<string, string>()
  const localStorage = {
    getItem: (key: string): string | null => storage.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      storage.set(key, value)
    },
    removeItem: (key: string): void => {
      storage.delete(key)
    },
  }
  return { body, document, window, localStorage, created, styleTags, listeners }
}

type Environment = ReturnType<typeof fakeEnvironment>

let env: Environment

/** Mount the plugin the way the module loader does, and hand back its teardown. */
function mount() {
  const { theme, stats } = fakeHostTheme(env.body)
  const disposers: Array<() => void> = []
  const ctx = {
    effect: (fn: () => unknown) => {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose as () => void)
      return () => {}
    },
    theme,
    locale: { register: () => () => {} },
    slots: { inject: () => () => {} },
    logger: { warn: () => {} },
  } as unknown as Context
  apply(ctx)
  return {
    stats,
    dispose: () => {
      for (const dispose of [...disposers].reverse()) dispose()
    },
  }
}

/** What every layer name resolves to right now. */
function snapshot(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of LAYER_NAMES) out[name] = env.body.style.getPropertyValue(name)
  return out
}

beforeEach(() => {
  env = fakeEnvironment()
  setAccent('mist')
  setReduceMaterial(false)
  vi.stubGlobal('document', env.document)
  vi.stubGlobal('window', env.window)
  vi.stubGlobal('localStorage', env.localStorage)
})

describe('uninstall leaves no token behind', () => {
  it('restores the empty baseline for every one of the 43 names', () => {
    const before = snapshot()
    const run = mount()

    const mounted = snapshot()
    const written = LAYER_NAMES.filter((name) => mounted[name] !== '')
    expect(written).toHaveLength(LAYER_NAMES.length)

    run.dispose()

    expect(snapshot()).toEqual(before)
    expect(env.body.style.length).toBe(0)
  })

  it('puts official inline values back with their priority, not just empty', () => {
    // The shipped theme writes its own inline values on body; ours must be a
    // layer on top of those, never a replacement.
    env.body.style.setProperty('--dsw-alias-bg-base', 'rgb(1, 2, 3)')
    env.body.style.setProperty('--dsw-alias-brand-primary', 'rgb(4, 5, 6)', 'important')

    const before = snapshot()
    mount().dispose()

    expect(snapshot()).toEqual(before)
    expect(env.body.style.getPropertyValue('--dsw-alias-bg-base')).toBe('rgb(1, 2, 3)')
    expect(env.body.style.getPropertyPriority('--dsw-alias-brand-primary')).toBe('important')
  })

  it('holds exactly one layer at a time across an accent switch', () => {
    const run = mount()
    setAccent('dusk')
    setAccent('amber')

    expect(run.stats.writes).toHaveLength(3)
    expect(run.stats.maxLive).toBe(1)

    run.dispose()

    expect(run.stats.live).toBe(0)
    expect(run.stats.disposals).toBe(3)
  })
})

describe('uninstall leaves no marker behind', () => {
  it('drops all three body attributes', () => {
    const run = mount()
    expect(env.body.hasAttribute('data-dsh-go-theme')).toBe(true)
    expect(env.body.hasAttribute('data-dsh-go-accent')).toBe(true)

    setReduceMaterial(true)
    expect(env.body.hasAttribute('data-dsh-go-reduce-material')).toBe(true)

    run.dispose()

    expect(env.body.probe.attributes.size).toBe(0)
    expect(env.body.hasAttribute('data-dsh-go-theme')).toBe(false)
    expect(env.body.hasAttribute('data-dsh-go-accent')).toBe(false)
    expect(env.body.hasAttribute('data-dsh-go-reduce-material')).toBe(false)
  })
})

describe('uninstall leaves no tag or node behind', () => {
  it('never creates an element of its own', () => {
    const run = mount()
    run.dispose()

    // Stylesheets ship inside the bundle and are injected by the build output at
    // factory time, which is the host's to reclaim; apply() must add none.
    expect(env.created).toEqual([])
    expect(env.styleTags).toEqual([])
    expect(env.document.adoptedStyleSheets).toEqual([])
  })

  it('never leaves a class on body', () => {
    const run = mount()
    expect([...env.body.probe.classes]).toEqual(['x1y2z3_root'])

    run.dispose()

    expect(env.body.probe.classes.size).toBe(0)
    expect(env.body.classList.contains('x1y2z3_root')).toBe(false)
  })
})

describe('uninstall leaves no listener behind', () => {
  it('removes both window listeners', () => {
    const run = mount()
    expect(env.listeners.get('dsh-go-theme:accent')?.size).toBe(1)
    expect(env.listeners.get('dsh-go-theme:reduce-material')?.size).toBe(1)

    run.dispose()

    expect(env.listeners.get('dsh-go-theme:accent')?.size ?? 0).toBe(0)
    expect(env.listeners.get('dsh-go-theme:reduce-material')?.size ?? 0).toBe(0)
  })

  it('ignores the external accent event once unmounted', () => {
    const run = mount()
    run.dispose()

    env.window.dispatchEvent({ type: 'dsh-go-theme:accent', detail: 'amber' } as unknown as Event)

    expect(env.body.hasAttribute('data-dsh-go-accent')).toBe(false)
    expect(snapshot()['--dsw-alias-brand-primary']).toBe('')
  })
})

describe('the one deliberate residue', () => {
  it('keeps the saved accent so a reinstall lands on the user\'s choice', () => {
    const run = mount()
    setAccent('turquoise')
    run.dispose()

    // Survives on purpose — a user's accent is not the plugin's property.
    expect(env.localStorage.getItem(PREFERENCES_KEY)).toContain('turquoise')

    const again = mount()
    expect(env.body.getAttribute('data-dsh-go-accent')).toBe('turquoise')
    again.dispose()

    expect(env.body.probe.attributes.size).toBe(0)
  })
})
