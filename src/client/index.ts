/**
 * Browser half of the DSH Go theme — the entry the client-module loader calls.
 *
 * T1.4 owns the lifecycle: one token layer per accent, rebuilt through the same
 * `overrideTokens` source so a switch replaces rather than stacks, plus a
 * teardown that restores the document exactly. T1.5 adds palette persistence.
 * T2 adds the material layer: `material.module.css` paints the page gradient
 * and glow, fed by the `--dsh-go-*` variables that ride the same token layer.
 * T3.1 adds the settings seat: the accent row lives in `settings.tsx` and its
 * copy in `strings.ts`, wired up at the bottom of {@link apply}.
 */
import type { Context } from '@deepseek-ai/cordis'
import { PALETTES, type AccentId } from './palettes.ts'
import { loadPreferences, updatePreferences } from './preferences.ts'
import { registerSettingsRows } from './settings.tsx'
import {
  ACCENT_EVENT,
  REDUCE_EVENT,
  getAccent,
  getReduceMaterial,
  setAccent,
  setReduceMaterial,
  subscribeAccent,
  subscribeReduceMaterial,
} from './state.ts'
import { SETTINGS_NS, en, zh } from './strings.ts'
import { buildTokenLayer } from './tokens.ts'
// Global-only stylesheet: the page gradient and the two guards around it.
// Imported for its side effect — the build emits one <style data-plugin> per
// module file, injected when the factory runs and reclaimed by the host on
// unload. Must stay a static top-level import: claimStyles only wraps factory
// materialisation, not apply() (docs/reference/phase0-findings.md §2).
import './material.module.css'
import styles from './theme.module.css'

/**
 * Cordis services this plugin consumes. The loader waits for each of them
 * before calling {@link apply}; omitting `theme` makes `ctx.theme` throw
 * `cannot get property "theme" without inject` at first access.
 */
export const inject = ['theme', 'slots', 'locale']

/** Marker attribute on `<body>`; the material layer hangs its selectors off it. */
const BODY_ATTRIBUTE = 'data-dsh-go-theme'

/** Current accent id, readable from CSS as `body[data-dsh-go-accent="dusk"]`. */
const ACCENT_ATTRIBUTE = 'data-dsh-go-accent'

/**
 * Present when the material layer must give up its blur (T2.3). The CSS also
 * honours `prefers-reduced-transparency` and a missing `backdrop-filter`; this
 * attribute is the in-app switch, owned by preferences until T3.4 adds the UI.
 */
const REDUCE_ATTRIBUTE = 'data-dsh-go-reduce-material'

/**
 * Layer identity for `overrideTokens`. One layer per source, so re-issuing with
 * the same source replaces the previous layer instead of stacking on top.
 */
const LAYER_SOURCE = '@dsh-external/dsh-client-ui-theme-go'

/**
 * Mount the theme.
 * @param ctx - client root context, provided by the module loader.
 */
export function apply(ctx: Context): void {
  const body = document.body
  const rootClass = styles.root ?? ''

  ctx.effect(() => {
    // Restore the persisted accent before the first layer is built. setAccent
    // fires listeners, but none are attached yet, so this only seeds the store.
    const initial = loadPreferences()
    if (initial.accent !== getAccent()) setAccent(initial.accent)
    if (initial.reduceMaterial !== getReduceMaterial()) setReduceMaterial(initial.reduceMaterial)

    let revert = ctx.theme.overrideTokens(LAYER_SOURCE, buildTokenLayer(PALETTES[getAccent()]))

    /**
     * Swap the token layer.
     *
     * The old layer is removed before the new one is added rather than relying
     * on same-source replacement: it keeps the invariant local instead of
     * depending on an implementation detail we do not own. Both calls are
     * synchronous, so no intermediate frame is painted.
     */
    const applyAccent = (accent: AccentId): void => {
      revert()
      revert = ctx.theme.overrideTokens(LAYER_SOURCE, buildTokenLayer(PALETTES[accent]))
      body.setAttribute(ACCENT_ATTRIBUTE, accent)
    }

    body.setAttribute(BODY_ATTRIBUTE, '')
    if (rootClass !== '') body.classList.add(rootClass)
    body.setAttribute(ACCENT_ATTRIBUTE, getAccent())

    // Persist on change. Writes go through the same defensive path as reads, so
    // a blocked storage degrades to session-only instead of throwing.
    const unsubscribe = subscribeAccent((accent) => {
      applyAccent(accent)
      updatePreferences({ accent })
    })

    const applyReduce = (reduce: boolean): void => {
      if (reduce) body.setAttribute(REDUCE_ATTRIBUTE, '')
      else body.removeAttribute(REDUCE_ATTRIBUTE)
    }
    applyReduce(getReduceMaterial())
    const unsubscribeReduce = subscribeReduceMaterial((reduce) => {
      applyReduce(reduce)
      updatePreferences({ reduceMaterial: reduce })
    })

    // External entry point: lets a user script or another plugin drive the
    // theme without importing this bundle. Unknown values are ignored.
    const onExternal = (event: Event): void => {
      setAccent((event as CustomEvent<unknown>).detail)
    }
    window.addEventListener(ACCENT_EVENT, onExternal)

    const onReduceExternal = (event: Event): void => {
      setReduceMaterial((event as CustomEvent<unknown>).detail)
    }
    window.addEventListener(REDUCE_EVENT, onReduceExternal)

    // Teardown must run through ctx.effect: returning a function from apply()
    // is NOT registered as a disposer (measured in phase 0, see
    // docs/reference/phase0-findings.md §2.3).
    return () => {
      window.removeEventListener(ACCENT_EVENT, onExternal)
      window.removeEventListener(REDUCE_EVENT, onReduceExternal)
      unsubscribe()
      unsubscribeReduce()
      revert()
      body.removeAttribute(BODY_ATTRIBUTE)
      body.removeAttribute(ACCENT_ATTRIBUTE)
      body.removeAttribute(REDUCE_ATTRIBUTE)
      if (rootClass !== '') body.classList.remove(rootClass)
    }
  }, 'ui-theme-go: token layer')

  // Settings surface (stage 3). The dictionaries go in as an effect so a reload
  // or unload drops them; the row itself is registered through slots.inject,
  // which waits for the owner section and cleans up with the plugin fiber.
  ctx.effect(
    () => ctx.locale.register(SETTINGS_NS, { zh, en }),
    'ui-theme-go: settings dictionaries',
  )
  registerSettingsRows(ctx)
}
