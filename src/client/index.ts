/**
 * Browser half of the DSH Go theme — the entry the client-module loader calls.
 *
 * T1.4 owns the lifecycle: one token layer per accent, rebuilt through the same
 * `overrideTokens` source so a switch replaces rather than stacks, plus a
 * teardown that restores the document exactly. T1.5 adds palette persistence.
 * T2 adds the material layer: `material.module.css` paints the page gradient
 * and glow, fed by the `--dsh-theme-mist-*` variables that ride the same token layer.
 * T3.1 adds the settings seat: the accent row lives in `settings.tsx` and its
 * copy in `strings.ts`, wired up at the bottom of {@link apply}.
 * T4.2 moves the write itself into `writer.ts`: a host without
 * `overrideTokens` gets the material layer plus one warning instead of a crash.
 */
import type { Context } from '@deepseek-ai/cordis'
import { PALETTES, type AccentId } from './palettes.ts'
import { loadPreferences, updatePreferences } from './preferences.ts'
import { registerSettingsRows } from './settings.tsx'
import {
  ACCENT_EVENT,
  SIDEBAR_EVENT,
  getAccent,
  getSidebarMaterial,
  setAccent,
  setSidebarMaterial,
  subscribeAccent,
  subscribeSidebarMaterial,
} from './state.ts'
import { SETTINGS_NS, en, zh } from './strings.ts'
import { buildTokenLayer } from './tokens.ts'
import { createLayerWriter, warnDegraded } from './writer.ts'
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
const BODY_ATTRIBUTE = 'data-dsh-theme-mist'

/** Current accent id, readable from CSS as `body[data-dsh-theme-mist-accent="dusk"]`. */
const ACCENT_ATTRIBUTE = 'data-dsh-theme-mist-accent'

/**
 * Which material the left column is painted with (T5.8), readable from CSS as
 * `body[data-dsh-theme-mist-sidebar="flat"]`. The attribute is always present, so the
 * stylesheet can name both states instead of treating "absent" as a third one.
 */
const SIDEBAR_ATTRIBUTE = 'data-dsh-theme-mist-sidebar'

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
    if (initial.sidebarMaterial !== getSidebarMaterial()) setSidebarMaterial(initial.sidebarMaterial)

    // Capability probe (T4.2): the host theme owns `overrideTokens`; without it
    // the writer degrades to our own material variables and says so once.
    const writer = createLayerWriter(ctx, body)
    if (writer.degraded) warnDegraded(ctx)

    let revert = writer.write(buildTokenLayer(PALETTES[getAccent()]))

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
      revert = writer.write(buildTokenLayer(PALETTES[accent]))
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

    const applySidebar = (material: string): void => {
      body.setAttribute(SIDEBAR_ATTRIBUTE, material)
    }
    applySidebar(getSidebarMaterial())
    const unsubscribeSidebar = subscribeSidebarMaterial((material) => {
      applySidebar(material)
      updatePreferences({ sidebarMaterial: material })
    })

    // External entry point: lets a user script or another plugin drive the
    // theme without importing this bundle. Unknown values are ignored.
    const onExternal = (event: Event): void => {
      setAccent((event as CustomEvent<unknown>).detail)
    }
    window.addEventListener(ACCENT_EVENT, onExternal)

    const onSidebarExternal = (event: Event): void => {
      setSidebarMaterial((event as CustomEvent<unknown>).detail)
    }
    window.addEventListener(SIDEBAR_EVENT, onSidebarExternal)

    // Teardown must run through ctx.effect: returning a function from apply()
    // is NOT registered as a disposer (measured in phase 0, see
    // docs/reference/phase0-findings.md §2.3).
    return () => {
      window.removeEventListener(ACCENT_EVENT, onExternal)
      window.removeEventListener(SIDEBAR_EVENT, onSidebarExternal)
      unsubscribe()
      unsubscribeSidebar()
      revert()
      body.removeAttribute(BODY_ATTRIBUTE)
      body.removeAttribute(ACCENT_ATTRIBUTE)
      body.removeAttribute(SIDEBAR_ATTRIBUTE)
      if (rootClass !== '') body.classList.remove(rootClass)
    }
  }, 'dsh-theme-mist: token layer')

  // Settings surface (stage 3). The dictionaries go in as an effect so a reload
  // or unload drops them; the row itself is registered through slots.inject,
  // which waits for the owner section and cleans up with the plugin fiber.
  ctx.effect(
    () => ctx.locale.register(SETTINGS_NS, { zh, en }),
    'dsh-theme-mist: settings dictionaries',
  )
  registerSettingsRows(ctx)
}
