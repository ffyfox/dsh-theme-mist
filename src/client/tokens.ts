/**
 * The token layer: DSH Go palette values projected onto official `--dsw-*` names.
 *
 * Scope is deliberately narrow — 34 official tokens, the same list as
 * docs/visual-spec.md §8.2, plus the five --dsh-go-* page-material variables
 * that material.module.css consumes (T2.2). The two lists are kept apart so
 * the official contract (34 names, each validated against the runtime) stays
 * unpolluted by our own namespace. Everything else is left to the official theme so
 * that untested surfaces keep their shipped appearance.
 *
 * `overrideTokens` does not validate token names: a typo is accepted silently
 * and simply never applies (measured phase 0, see
 * docs/reference/phase0-findings.md §1.3). `TOKEN_NAMES` is therefore the
 * single source of truth for both the mapping and the build-time whitelist
 * check in tools/check-tokens.mjs.
 */
import type { AccentPalette } from './palettes.ts'

/** One token's value in both colour schemes. */
export interface TokenPair {
  readonly light: string
  readonly dark: string
}

/**
 * Every token this theme touches, in the order of visual-spec §8.2.
 * 27 `--dsw-alias-*` + 7 `--dsw-specific-*`.
 */
export const TOKEN_NAMES = [
  // Surfaces (5)
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-layer-3',
  '--dsw-alias-bg-overlay',
  // Text (6)
  '--dsw-alias-label-primary',
  '--dsw-alias-label-secondary',
  '--dsw-alias-label-tertiary',
  '--dsw-alias-label-caption',
  '--dsw-alias-label-dimmed',
  '--dsw-alias-label-primary-foreground',
  // Borders (4)
  '--dsw-alias-border-l1',
  '--dsw-alias-border-l2',
  '--dsw-alias-border-l3',
  '--dsw-alias-border-l4',
  // Brand / buttons (4)
  '--dsw-alias-brand-primary',
  '--dsw-alias-brand-text',
  '--dsw-alias-button-primary-fill',
  '--dsw-alias-button-primary-hover',
  // Business state (2)
  '--dsw-alias-state-business-primary',
  '--dsw-alias-state-business-tertiary',
  // Interaction feedback (2)
  '--dsw-alias-interactive-bg-hover',
  '--dsw-alias-interactive-bg-active',
  // Sidebar, bubbles, input, selector (7)
  '--dsw-specific-sidebar-fill',
  '--dsw-specific-sidebar-nav-item-active',
  '--dsw-specific-sidebar-nav-item-active-accent',
  '--dsw-specific-bubble',
  '--dsw-specific-bubble-highlight',
  '--dsw-specific-input-major',
  '--dsw-specific-selector',
  // Code (2)
  '--dsw-alias-markdown-code-block',
  '--dsw-alias-markdown-inline-code',
  // Scrollbar (2)
  '--dsw-alias-scrollbar-bg-l1',
  '--dsw-alias-scrollbar-hover-l1',
] as const

export type TokenName = (typeof TOKEN_NAMES)[number]

/**
 * Page-material variables (--dsh-go-*). NOT official tokens — they exist so
 * material.module.css can reach per-accent, per-scheme values without
 * hard-coding six palettes in CSS. They ride the token layer because
 * overrideTokens already resolves light/dark and reverts them through the
 * same disposer that restores the official tokens: one lifecycle, and no
 * second writer of body's inline style to tear down.
 */
export const MATERIAL_VARS = [
  '--dsh-go-page-base',
  '--dsh-go-page-top',
  '--dsh-go-page-bottom',
  '--dsh-go-glow',
  '--dsh-go-haze',
  '--dsh-go-chrome-fill',
  '--dsh-go-chrome-solid',
  '--dsh-go-sheet-fill',
  '--dsh-go-sheet-solid',
  '--dsh-go-card-fill',
  '--dsh-go-card-solid',
  '--dsh-go-pill-fill',
  '--dsh-go-pill-solid',
  '--dsh-go-highlight',
  '--dsh-go-shadow',
] as const

export type MaterialVar = (typeof MATERIAL_VARS)[number]

/** Everything this layer writes: 34 official tokens + 5 material variables. */
export type LayerName = TokenName | MaterialVar

/** A complete layer: every name in TOKEN_NAMES and MATERIAL_VARS. */
export type TokenLayer = Readonly<Record<LayerName, TokenPair>>

/**
 * Interaction feedback stays bound to the brand colour rather than carrying
 * six hard-coded pairs, so all palettes share one rule. Mixing against
 * `transparent` keeps the surface texture visible underneath.
 */
const brandMix = (percent: number): string =>
  `color-mix(in srgb, var(--dsw-alias-brand-primary) ${percent}%, transparent)`

/**
 * The page wash is gone (T5.5).
 *
 * Until this change bg-base carried the palette's mid surface at 0.36, and the
 * host paints that token twice (AppFrame + ConversationRoot), so the eye saw a
 * 0.59 opaque veil sitting on top of the backdrop. That veil — not the palette
 * — is why the six accents looked alike: it cut the accent glow to 41% of what
 * DSH Go paints. Measured against upstream's own golden
 * (app/test/shell/adaptive/goldens/wide_sidebar_light.png), the largest
 * colour difference across the six accents was dE00 15.75 at the glow corner
 * where DSH Go reaches 28.27.
 *
 * DSH Go has no such surface: the backdrop *is* the page (backdrop.dart:303-333)
 * and every panel above it is a glass tier carrying its own fill
 * (surfaces.dart:159-259). So bg-base goes fully transparent and the tiers
 * below take over.
 *
 * Consequence, and the reason this is one change and not two: every surface
 * that used bg-base as its fill loses it, so each tier is re-bound on semantic
 * hooks in material.module.css.
 */
const TRANSPARENT = 'transparent'

/**
 * Sidebar column fill, fitted to upstream's own rendering.
 *
 * Was `mistLow` at 0.40 (dark: `nightLowest` at 0.42) — wrong colour *and*
 * wrong alpha, hidden until now because the page wash was doing the rest of
 * the work. Fitting the light and dark wide-sidebar goldens pixel by pixel
 * gives mistLow @ 0.82 and sheetDark @ 0.86, reproducing the measured sidebar
 * to 1.5 and 0.6 / 255.
 */
const SIDEBAR_ALPHA = { light: 0.82, dark: 0.86 } as const

/** Glow and haze opacity at their gradient origin (visual-spec §7). */
const GLOW_ALPHA = { light: 0.42, dark: 0.28 } as const
const HAZE_ALPHA = { light: 0.38, dark: 0.24 } as const

/**
 * The four glass tiers, taken from DSH Go's surfaces.dart:159-259.
 *
 * | tier   | light          | dark            | blur            |
 * |--------|----------------|-----------------|-----------------|
 * | chrome | white 0.70     | smoke 0.72      | 18px, sat 1.3/1.2 |
 * | sheet  | mistLow 0.82   | sheetDark 0.86  | 24px, sat 1.4/1.2 |
 * | card   | white 0.62     | white 0.05      | none            |
 * | pill   | white 0.55     | white 0.06      | none            |
 *
 * Light-mode fills are plain white on purpose: DSH Go's glass stays white
 * whatever the accent, and only the page underneath changes hue ("换了配色,
 * 玻璃还是玻璃", surfaces.dart:157-158). Only the tiers that float over moving
 * content blur; card and pill sit on a static gradient where a blur would cost
 * a compositing layer and show nothing.
 *
 * Each tier has a "solid" twin — upstream's fallbackFill — used where the blur
 * is unavailable: no backdrop-filter support, "reduce transparency", or the
 * in-app switch. Those stay near opaque, or text scrolling behind the band
 * runs into the input line.
 */
const CHROME_ALPHA = { light: 0.7, dark: 0.72 } as const
const CHROME_SOLID_ALPHA = { light: 0.96, dark: 0.97 } as const
const SHEET_ALPHA = { light: 0.82, dark: 0.86 } as const
const CARD_ALPHA = { light: 0.62, dark: 0.05 } as const
const CARD_SOLID_ALPHA = { light: 0.72, dark: 0.06 } as const
const PILL_ALPHA = { light: 0.55, dark: 0.06 } as const
const PILL_SOLID_ALPHA = { light: 0.66, dark: 0.07 } as const

/**
 * The 1px inner line along the top edge of a card or pill (T2.4/T2.5).
 *
 * This is what makes a flat translucent surface read as a solid object under a
 * light source from above; DSH Go puts it on every card, chip and the top bar.
 * Dark mode keeps only a trace of it — a bright line on a dark card reads as a
 * seam rather than as light.
 */
const HIGHLIGHT_ALPHA = { light: 0.55, dark: 0.1 } as const

/**
 * Drop-shadow opacity (T2.5).
 *
 * Tinted with the palette's own ink (shadowInk light / shadowNight dark) rather
 * than pure black: DSH Go's shadows are cold, and a neutral black reads dirty
 * against a tinted page. Kept low on purpose — the design puts the hierarchy in
 * material and hairlines, and leaves shadows as a hint at the edge.
 */
const SHADOW_ALPHA = { light: 0.07, dark: 0.45 } as const

/**
 * #RRGGBB at a given alpha, as rgba().
 *
 * Spelled out rather than color-mix(...) so the value is a plain colour the
 * e2e snapshot compares verbatim. A non-hex input can only be generator drift,
 * and throwing here surfaces it in the build-time checks instead of shipping
 * an opaque page.
 * @param hex - opaque #RRGGBB straight from the palette generator.
 * @param alpha - 0..1.
 * @returns an rgba() colour string.
 */
function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('withAlpha: expected #RRGGBB, got "' + hex + '"')
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')'
}

/**
 * Expand one palette into the official token layer.
 *
 * The return type is a total record over `TokenName`, so adding a name to
 * {@link TOKEN_NAMES} without mapping it here fails the type check.
 * @param p - accent palette from the generator.
 * @returns light/dark values for all 34 tokens.
 */
export function buildTokenLayer(p: AccentPalette): TokenLayer {
  const [l1, l2, l3, l4] = p.hairline.light
  const [d1, d2, d3, d4] = p.hairline.dark

  return {
    // Surfaces — layer-1 is the brightest surface in light mode and the
    // first lifted surface in dark mode, hence the ramp direction flip.
    // bg-base is the page itself, and the page is the backdrop: DSH Go paints
    // nothing on top of it (see TRANSPARENT above). Nested surfaces stay
    // opaque; the tiers that used to lean on this token are re-bound in
    // material.module.css.
    '--dsw-alias-bg-base': { light: TRANSPARENT, dark: TRANSPARENT },
    '--dsw-alias-bg-layer-1': { light: p.light.mistLowest, dark: p.dark.nightLow },
    '--dsw-alias-bg-layer-2': { light: p.light.mistLow, dark: p.dark.nightContainer },
    '--dsw-alias-bg-layer-3': { light: p.light.mistContainer, dark: p.dark.nightHigh },
    '--dsw-alias-bg-overlay': { light: p.light.mistHigh, dark: p.dark.nightHighest },

    // Text. Caption carries the derived fifth level: equal to tertiary in
    // light mode, a real step in dark mode.
    '--dsw-alias-label-primary': { light: p.light.ink, dark: p.dark.paper },
    '--dsw-alias-label-secondary': { light: p.light.inkMuted, dark: p.dark.paperMuted },
    '--dsw-alias-label-tertiary': { light: p.light.inkFaint, dark: p.dark.paperFaint },
    '--dsw-alias-label-caption': { light: p.caption.light, dark: p.caption.dark },
    '--dsw-alias-label-dimmed': { light: p.light.inkGhost, dark: p.dark.paperGhost },
    // Foreground on an accent-filled control: near-white in light mode,
    // the accent's own dark ink in dark mode (never plain white — the
    // official dark button keeps >= 7:1 that way).
    '--dsw-alias-label-primary-foreground': { light: p.light.mistLowest, dark: p.accent.onSeedDark },

    // Borders must be alpha, never the solid rule greys, or the page
    // gradient stops showing through (visual-spec §6.1.2).
    '--dsw-alias-border-l1': { light: l1, dark: d1 },
    '--dsw-alias-border-l2': { light: l2, dark: d2 },
    '--dsw-alias-border-l3': { light: l3, dark: d3 },
    '--dsw-alias-border-l4': { light: l4, dark: d4 },

    // Brand. Officially brand-primary is near-black/near-white; mapping the
    // accent seed here is a deliberate semantic change (visual-spec §6.1.1).
    // button-primary-fill follows brand-primary automatically, but
    // button-primary-hover is hard-coded to neutral-bluish-750 upstream,
    // so it must be set explicitly.
    '--dsw-alias-brand-primary': { light: p.accent.seed, dark: p.accent.seedDark },
    '--dsw-alias-brand-text': { light: p.light.ink, dark: p.dark.paper },
    '--dsw-alias-button-primary-fill': { light: p.accent.seed, dark: p.accent.seedDark },
    '--dsw-alias-button-primary-hover': { light: p.accent.pressed, dark: p.accent.pressedDark },

    '--dsw-alias-state-business-primary': { light: p.accent.seed, dark: p.accent.seedDark },
    '--dsw-alias-state-business-tertiary': { light: p.accent.container, dark: p.accent.containerDark },

    '--dsw-alias-interactive-bg-hover': { light: brandMix(7), dark: brandMix(10) },
    '--dsw-alias-interactive-bg-active': { light: brandMix(14), dark: brandMix(18) },

    // The sidebar is a sheet, not a page: upstream keeps it at 0.82/0.86 so the
    // backdrop only tints it, rather than showing through it.
    '--dsw-specific-sidebar-fill': {
      light: withAlpha(p.light.mistLow, SIDEBAR_ALPHA.light),
      dark: withAlpha(p.dark.sheetDark, SIDEBAR_ALPHA.dark),
    },
    '--dsw-specific-sidebar-nav-item-active': { light: p.light.mistContainer, dark: p.dark.nightHigh },
    '--dsw-specific-sidebar-nav-item-active-accent': { light: p.accent.container, dark: p.accent.containerDark },
    '--dsw-specific-bubble': { light: p.accent.bubble, dark: p.accent.bubbleDark },
    '--dsw-specific-bubble-highlight': { light: p.accent.bubbleHighlight, dark: p.accent.containerDark },
    '--dsw-specific-input-major': { light: p.light.mistLowest, dark: p.dark.nightLow },
    '--dsw-specific-selector': { light: p.light.mistContainer, dark: p.dark.nightContainer },

    '--dsw-alias-markdown-code-block': { light: p.light.codeWell, dark: p.dark.codeWellDark },
    '--dsw-alias-markdown-inline-code': { light: p.light.codeWell, dark: p.dark.codeWellDark },

    '--dsw-alias-scrollbar-bg-l1': { light: p.light.mistHigh, dark: p.dark.nightHigh },
    '--dsw-alias-scrollbar-hover-l1': { light: p.light.mistHighest, dark: p.dark.nightHighest },

    // --- Page material (T2.2) ---------------------------------------------
    // Not official tokens; consumed only by material.module.css. The glow and
    // haze arrive pre-multiplied, so each gradient stop is a plain colour and
    // each scheme carries its own intensity (42/38 light, 28/24 dark).
    '--dsh-go-page-base': { light: p.light.mist, dark: p.dark.night },
    '--dsh-go-page-top': { light: p.light.mistTop, dark: p.dark.nightTop },
    '--dsh-go-page-bottom': { light: p.light.mistBottom, dark: p.dark.nightBottom },
    '--dsh-go-glow': {
      light: withAlpha(p.accent.glow, GLOW_ALPHA.light),
      dark: withAlpha(p.accent.glowDark, GLOW_ALPHA.dark),
    },
    '--dsh-go-haze': {
      light: withAlpha(p.accent.haze, HAZE_ALPHA.light),
      dark: withAlpha(p.accent.hazeDark, HAZE_ALPHA.dark),
    },
    // --- Glass tiers (T2.3 / T5.5) -----------------------------------------
    // Two values per tier: the blur fill and the near-opaque fallback the
    // degradation paths swap in (see material.module.css).
    '--dsh-go-chrome-fill': {
      light: withAlpha('#FFFFFF', CHROME_ALPHA.light),
      dark: withAlpha(p.dark.smoke, CHROME_ALPHA.dark),
    },
    '--dsh-go-chrome-solid': {
      light: withAlpha(p.light.mistLowest, CHROME_SOLID_ALPHA.light),
      dark: withAlpha(p.dark.smoke, CHROME_SOLID_ALPHA.dark),
    },
    '--dsh-go-sheet-fill': {
      light: withAlpha(p.light.mistLow, SHEET_ALPHA.light),
      dark: withAlpha(p.dark.sheetDark, SHEET_ALPHA.dark),
    },
    '--dsh-go-sheet-solid': { light: p.light.mistLow, dark: p.dark.sheetDark },
    '--dsh-go-card-fill': {
      light: withAlpha('#FFFFFF', CARD_ALPHA.light),
      dark: withAlpha('#FFFFFF', CARD_ALPHA.dark),
    },
    '--dsh-go-card-solid': {
      light: withAlpha('#FFFFFF', CARD_SOLID_ALPHA.light),
      dark: withAlpha('#FFFFFF', CARD_SOLID_ALPHA.dark),
    },
    '--dsh-go-pill-fill': {
      light: withAlpha('#FFFFFF', PILL_ALPHA.light),
      dark: withAlpha('#FFFFFF', PILL_ALPHA.dark),
    },
    '--dsh-go-pill-solid': {
      light: withAlpha('#FFFFFF', PILL_SOLID_ALPHA.light),
      dark: withAlpha('#FFFFFF', PILL_SOLID_ALPHA.dark),
    },
    // --- Rim, highlight and shadow (T2.4 / T2.5) ---------------------------
    // Shared by our own card/pill rules and by the elevation recipes below,
    // so the highlight and the shadow are defined once per scheme.
    '--dsh-go-highlight': {
      light: withAlpha('#FFFFFF', HIGHLIGHT_ALPHA.light),
      dark: withAlpha('#FFFFFF', HIGHLIGHT_ALPHA.dark),
    },
    '--dsh-go-shadow': {
      light: withAlpha(p.light.shadowInk, SHADOW_ALPHA.light),
      dark: withAlpha(p.dark.shadowNight, SHADOW_ALPHA.dark),
    },
  }
}
