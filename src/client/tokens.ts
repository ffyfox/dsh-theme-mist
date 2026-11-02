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
 * Opacity of the two page-surface tokens (T2.7).
 *
 * The five opaque layers stacked above body — AppFrame, sidebar column,
 * sidebar root, conversation root, composer seat — are painted from exactly
 * these two tokens, so the page gradient only becomes visible once both carry
 * alpha. Measured on 0.2.1 and 0.2.2: docs/reference/phase0-findings.md §3.3.
 *
 * These are *per-layer* alphas, and the stack depth matters: on 0.2.2 the two
 * page surfaces nest (AppFrame paints bg-base, ConversationRoot paints it
 * again), so the wash the eye sees is 1 - (1 - alpha)^2. Measured by pixel
 * sampling in docs/visual-spec.md §7 — 0.36 light / 0.46 dark lands on an
 * effective 0.59 / 0.71, and that is what the screenshots compared.
 *
 * The values sit on the opaque side of "the gradient still reads" on purpose:
 * nothing composited above the page has real blur yet (that is T2.3), and
 * without blur a lower alpha lets scrolled text ghost through the composer
 * seat and the sticky headers. Re-tune downwards together with that glass —
 * never to fully transparent, which would flatten the surface hierarchy the
 * whole design rests on.
 */
const PAGE_ALPHA = { light: 0.36, dark: 0.46 } as const
const SIDEBAR_ALPHA = { light: 0.4, dark: 0.42 } as const

/** Glow and haze opacity at their gradient origin (visual-spec §7). */
const GLOW_ALPHA = { light: 0.42, dark: 0.28 } as const
const HAZE_ALPHA = { light: 0.38, dark: 0.24 } as const

/**
 * Chrome glass fill opacity (T2.3), from visual-spec §7's two tiers.
 *
 * Chrome is the tier that carries real blur — it floats over content that
 * scrolls, so the blur has something to work with. The colour underneath is
 * the palette's own lifted surface (mistLowest light, smoke dark), not plain
 * white, so the glass keeps the palette's hue instead of greying the page.
 */
const CHROME_ALPHA = { light: 0.7, dark: 0.72 } as const

/**
 * The same surface with the blur unavailable — "reduce transparency", no
 * backdrop-filter support, or the in-app switch. Near opaque on purpose: an
 * unblurred half-transparent band lets scrolled text run into the input line,
 * which reads worse than losing the material.
 */
const CHROME_SOLID_ALPHA = 0.97

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
    // bg-base carries alpha: it paints the app frame, the conversation column
    // and the composer seat's sticky fade, so translucency there is exactly
    // what lets the page gradient through (T2.7). Nested surfaces stay opaque.
    '--dsw-alias-bg-base': {
      light: withAlpha(p.light.mist, PAGE_ALPHA.light),
      dark: withAlpha(p.dark.night, PAGE_ALPHA.dark),
    },
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

    // Same reasoning as bg-base: the sidebar column and the sidebar root both
    // read this token, so it must be translucent for the gradient to reach them.
    '--dsw-specific-sidebar-fill': {
      light: withAlpha(p.light.mistLow, SIDEBAR_ALPHA.light),
      dark: withAlpha(p.dark.nightLowest, SIDEBAR_ALPHA.dark),
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
    // --- Chrome glass (T2.3) ----------------------------------------------
    // Two values rather than one because the degradation paths need a fill
    // that stays legible without a blur (see material.module.css).
    '--dsh-go-chrome-fill': {
      light: withAlpha(p.light.mistLowest, CHROME_ALPHA.light),
      dark: withAlpha(p.dark.smoke, CHROME_ALPHA.dark),
    },
    '--dsh-go-chrome-solid': {
      light: withAlpha(p.light.mistLowest, CHROME_SOLID_ALPHA),
      dark: withAlpha(p.dark.smoke, CHROME_SOLID_ALPHA),
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
