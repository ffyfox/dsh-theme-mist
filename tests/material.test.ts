/**
 * Page-material contract (T2.7 translucency + T2.2 gradient).
 *
 * Two things are easy to get silently wrong and impossible to see in a unit
 * test's absence:
 *
 *  - surface alpha creeping to opaque (gradient disappears) or to zero (the
 *    surface hierarchy collapses), for any of the six palettes;
 *  - the stylesheet losing the property that makes the gradient behave like a
 *    page rather than a moving backdrop, or growing an !important that would
 *    fight the official theme instead of outranking it by specificity.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ACCENT_IDS, PALETTES } from '../src/client/palettes.ts'
import { MATERIAL_VARS, TOKEN_NAMES, buildTokenLayer } from '../src/client/tokens.ts'

const REPO = dirname(dirname(fileURLToPath(import.meta.url)))
const CSS = readFileSync(join(REPO, 'src', 'client', 'material.module.css'), 'utf8')

/**
 * The stylesheet with comments stripped.
 *
 * Structural assertions (which properties exist, how many rules declare them)
 * must not be able to match prose — a comment explaining why we avoid
 * !important would otherwise fail the !important check.
 */
const CSS_RULES = CSS.replace(/\/\*[\s\S]*?\*\//g, '')

/** The first rule in the file: the page surface (gradient + glow + ramp). */
const PAGE_RULE = CSS_RULES.slice(0, CSS_RULES.indexOf('}') + 1)

const RGBA = /^rgba\((\d+), (\d+), (\d+), ([0-9.]+)\)$/

const alphaOf = (value: string): number => {
  const match = RGBA.exec(value)
  if (match === null) throw new Error('not rgba(): ' + value)
  return Number(match[4])
}

describe('surface translucency (T2.7)', () => {
  const SURFACES = ['--dsw-alias-bg-base', '--dsw-specific-sidebar-fill'] as const

  it('binds exactly two official tokens to alpha', () => {
    for (const id of ACCENT_IDS) {
      const layer = buildTokenLayer(PALETTES[id])
      const translucent = TOKEN_NAMES.filter((name) => RGBA.test(layer[name].light) || RGBA.test(layer[name].dark))
      expect(translucent).toEqual([...SURFACES])
    }
  })

  it.each(ACCENT_IDS)('%s: the stacked wash stays in the calibrated window', (id) => {
    const layer = buildTokenLayer(PALETTES[id])
    for (const name of SURFACES) {
      for (const scheme of ['light', 'dark'] as const) {
        const alpha = alphaOf(layer[name][scheme])
        // Per-layer alpha: two nested surfaces paint each token, so the wash
        // the eye sees is 1 - (1 - alpha)^2 (measured on 0.2.2, see
        // docs/visual-spec.md §7). Both ends are calibrated numbers: below
        // ~0.45 the surface stops reading as a surface, above ~0.75 the page
        // gradient is gone and T2.7 becomes a no-op.
        const wash = 1 - (1 - alpha) ** 2
        expect(alpha, name + '[' + scheme + '] alpha').toBeGreaterThan(0.2)
        expect(wash, name + '[' + scheme + '] wash').toBeGreaterThanOrEqual(0.45)
        expect(wash, name + '[' + scheme + '] wash').toBeLessThanOrEqual(0.75)
      }
    }
  })

  it.each(ACCENT_IDS)('%s: the sidebar stays distinguishable from the page', (id) => {
    const layer = buildTokenLayer(PALETTES[id])
    for (const scheme of ['light', 'dark'] as const) {
      expect(layer['--dsw-specific-sidebar-fill'][scheme])
        .not.toBe(layer['--dsw-alias-bg-base'][scheme])
    }
  })
})

describe('material variables (T2.2)', () => {
  it('are namespaced and never collide with an official token', () => {
    for (const name of MATERIAL_VARS) expect(name.startsWith('--dsh-go-')).toBe(true)
    expect(MATERIAL_VARS.filter((name) => (TOKEN_NAMES as readonly string[]).includes(name))).toEqual([])
  })

  it.each(ACCENT_IDS)('%s: the layer carries every material variable', (id) => {
    const layer = buildTokenLayer(PALETTES[id])
    expect(Object.keys(layer)).toHaveLength(TOKEN_NAMES.length + MATERIAL_VARS.length)
    for (const name of MATERIAL_VARS) expect(layer[name].light).not.toBe('')
  })

  it.each(ACCENT_IDS)('%s: gradient stops are opaque and come from the palette', (id) => {
    const p = PALETTES[id]
    const layer = buildTokenLayer(p)
    expect(layer['--dsh-go-page-base'].light).toBe(p.light.mist)
    expect(layer['--dsh-go-page-base'].dark).toBe(p.dark.night)
    expect(layer['--dsh-go-page-top'].light).toBe(p.light.mistTop)
    expect(layer['--dsh-go-page-top'].dark).toBe(p.dark.nightTop)
    expect(layer['--dsh-go-page-bottom'].light).toBe(p.light.mistBottom)
    expect(layer['--dsh-go-page-bottom'].dark).toBe(p.dark.nightBottom)
  })

  it.each(ACCENT_IDS)('%s: glow and haze carry their source colour and scheme alpha', (id) => {
    const p = PALETTES[id]
    const layer = buildTokenLayer(p)
    // Colour and alpha are checked together: the rgb triple proves the value
    // came from the palette, the alpha proves the per-scheme intensity. That
    // pair is what lets six palettes share one stylesheet.
    expect(layer['--dsh-go-glow'].light).toBe(rgba(p.accent.glow, 0.42))
    expect(layer['--dsh-go-glow'].dark).toBe(rgba(p.accent.glowDark, 0.28))
    expect(layer['--dsh-go-haze'].light).toBe(rgba(p.accent.haze, 0.38))
    expect(layer['--dsh-go-haze'].dark).toBe(rgba(p.accent.hazeDark, 0.24))
  })
})

describe('chrome glass (T2.3)', () => {
  it.each(ACCENT_IDS)('%s: the glass fill is translucent, its fallback is not', (id) => {
    const layer = buildTokenLayer(PALETTES[id])
    for (const scheme of ['light', 'dark'] as const) {
      const fill = alphaOf(layer['--dsh-go-chrome-fill'][scheme])
      const solid = alphaOf(layer['--dsh-go-chrome-solid'][scheme])
      // Below ~0.55 the input text fights with the blurred backdrop, above
      // ~0.85 the blur stops being visible at all (visual-spec §7).
      expect(fill, 'fill[' + scheme + ']').toBeGreaterThanOrEqual(0.55)
      expect(fill, 'fill[' + scheme + ']').toBeLessThanOrEqual(0.85)
      // The fallback exists for the no-blur paths: near opaque, never clear.
      expect(solid, 'solid[' + scheme + ']').toBeGreaterThanOrEqual(0.9)
    }
  })

  it('paints the glass with a variable-driven blur, so degradation is one flip', () => {
    expect(CSS_RULES).toContain('backdrop-filter: var(--dsh-go-glass-blur)')
    // One blur declaration only: the seat carries it, the card inside it must
    // not blur an already-blurred backdrop (that would be two costs, one look).
    expect(CSS_RULES.match(/backdrop-filter: var\(/g)).toHaveLength(1)
    expect(CSS_RULES).not.toContain('!important')
  })

  it('keeps three degradation paths, all re-declared on the surfaces', () => {
    expect(CSS).toContain('@supports not (backdrop-filter: blur(1px))')
    expect(CSS).toContain('prefers-reduced-transparency: reduce')
    expect(CSS).toContain('[data-dsh-go-reduce-material]')
    // Regression guard for two measured traps:
    //  1. declaring the variables on body only is not enough — Chromium will
    //     not re-resolve an inherited custom property inside a gradient;
    //  2. a bare attribute selector loses to the official
    //     .root[data-phase=active] .composerSeat rule.
    const seatSelector = "[data-composer-seat][data-conversation-region='composer']"
    expect(CSS.split(seatSelector).length - 1).toBe(4) // normal + three paths
    expect(CSS.split('--dsh-go-seat-end: var(--dsh-go-chrome-solid)').length - 1).toBe(3)
    expect(CSS.split('--dsh-go-glass-fill: var(--dsh-go-chrome-solid)').length - 1).toBe(3)
  })
})

describe('card, pill and elevation (T2.4 / T2.5)', () => {
  /** The card/pill section: from the first card rule to the elevation block. */
  const CARD_SECTION = CSS_RULES.slice(
    CSS_RULES.indexOf('[data-message-bubble]'),
    CSS_RULES.indexOf('--dsw-elevation-panel'),
  )

  it.each(ACCENT_IDS)('%s: highlight is warm-white, shadow is palette ink', (id) => {
    const layer = buildTokenLayer(PALETTES[id])
    // A bright line on a dark card reads as a seam, so the dark highlight is
    // only a trace (visual-spec §7).
    expect(alphaOf(layer['--dsh-go-highlight'].light), 'light highlight').toBeGreaterThan(0.3)
    expect(alphaOf(layer['--dsh-go-highlight'].dark), 'dark highlight').toBeLessThan(0.2)
    // Shadows are a hint at the edge, never the thing that builds hierarchy.
    expect(alphaOf(layer['--dsh-go-shadow'].light), 'light shadow').toBeLessThanOrEqual(0.1)
    // Tinted with the palette's own ink — a neutral black reads dirty on a
    // tinted page.
    for (const scheme of ['light', 'dark'] as const) {
      expect(layer['--dsh-go-shadow'][scheme]).not.toMatch(/^rgba\(0, 0, 0,/)
    }
  })

  it('paints the card and pill tiers with a rim and a highlight, never a blur', () => {
    expect(CARD_SECTION).toContain('[data-message-bubble]')
    // The markdown class must be escaped: this file is a CSS Module, and a
    // bare .md-code-block would be localised into a hash that matches nothing.
    expect(CARD_SECTION).toContain(':global(.md-code-block)')
    expect(CARD_SECTION).toContain("[data-slot='conversation.input.model'] button")
    expect(CARD_SECTION).toContain('inset 0 0 0 0.5px var(--dsw-alias-border-l1)')
    expect(CARD_SECTION).toContain('inset 0 1px 0 var(--dsh-go-highlight)')
    // The performance rule of the tier (surfaces.dart:17-19): no blur here.
    expect(CARD_SECTION).not.toContain('backdrop-filter')
  })

  it('rebinds every elevation recipe on the whole scope, not just body', () => {
    // Declaring these on body alone is inert: the official theme re-declares
    // them on "body, body *", so each element keeps its own value
    // (visual-spec §8.1 R1).
    expect(CSS_RULES).toMatch(/body\[data-dsh-go-theme\],\s*body\[data-dsh-go-theme\] \*\s*\{/)
    for (const name of ['--dsw-elevation-panel', '--dsw-elevation-prominent', '--dsw-elevation-soft']) {
      const start = CSS_RULES.lastIndexOf('body[data-dsh-go-theme] *', CSS_RULES.indexOf(name))
      expect(start, name + ' must be declared inside the scoped block').toBeGreaterThan(-1)
      expect(CSS_RULES.slice(start, CSS_RULES.indexOf('}', start))).toContain(name)
    }
    // Every recipe keeps the official stroke reference and adds the highlight.
    expect(CSS_RULES.split('inset 0 1px 0 var(--dsh-go-highlight)').length - 1).toBeGreaterThanOrEqual(5)
  })
})

describe('shape ladder (T2.1)', () => {
  // Bounded by the motion block, which is the last section and mentions the
  // composer card again (its transition) — this slice must stay about radii.
  const SHAPE_SECTION = CSS_RULES.slice(
    CSS_RULES.indexOf('--dsh-go-radius-xs'),
    CSS_RULES.indexOf('--dsh-go-duration-press'),
  )

  it('defines the DSH Go ladder once and never touches the official radius tokens', () => {
    for (const [name, value] of [
      ['xs', '6px'], ['sm', '10px'], ['md', '14px'], ['lg', '20px'], ['xl', '28px'], ['pill', '999px'],
    ]) {
      expect(SHAPE_SECTION).toContain('--dsh-go-radius-' + name + ': ' + value)
    }
    // visual-spec §1.1: overriding --dsw-radius-* would move radii on every
    // component at once, including the ones DSH Go has no opinion about.
    expect(CSS_RULES).not.toContain('--dsw-radius-')
  })

  it('re-points only the steps between the two ladders', () => {
    // 16 -> 14, 8 -> 6, 8 -> stadium; composer (28) and bubbles (20) already
    // match, so they must not be re-declared at all.
    expect(SHAPE_SECTION).toContain('border-radius: var(--dsh-go-radius-md)')
    expect(SHAPE_SECTION).toContain(':not(pre) > code')
    expect(SHAPE_SECTION).toContain('border-radius: var(--dsh-go-radius-xs)')
    expect(SHAPE_SECTION).toContain("[role='menu']")
    expect(SHAPE_SECTION).toContain('border-radius: var(--dsh-go-radius-pill)')
    expect(SHAPE_SECTION).toContain('corner-shape: round')
    expect(SHAPE_SECTION).not.toContain('[data-composer-card]')
    expect(SHAPE_SECTION).not.toContain('[data-message-bubble]')
  })
})

describe('motion (T2.6)', () => {
  const MOTION = CSS_RULES.slice(CSS_RULES.indexOf('--dsh-go-duration-press'))

  it('uses its own duration scale and never redefines the shared official tokens', () => {
    expect(MOTION).toContain('--dsh-go-duration-press: 90ms')
    expect(MOTION).toContain('--dsh-go-duration-quick: 160ms')
    expect(MOTION).toContain('--dsh-go-duration-standard: 240ms')
    expect(MOTION).toContain('cubic-bezier(0.4, 0, 0.2, 1)')
    expect(MOTION).toContain('transition: background-color var(--dsh-go-duration-quick)')
    // The official duration/easing tokens also drive the sidebar and panel drag
    // animations — redefining them would move the layout, not the theme.
    expect(CSS_RULES).not.toContain('--ds-transition-duration')
    expect(CSS_RULES).not.toContain('--ds-ease')
  })

  it('guards every transition with prefers-reduced-motion', () => {
    expect(MOTION).toContain('prefers-reduced-motion: reduce')
    const guard = MOTION.slice(MOTION.indexOf('prefers-reduced-motion'))
    expect(guard).toContain('transition: none')
    expect(guard).toContain('animation: none')
  })

  it('animates nothing at all', () => {
    // The page glow is deliberately static: it lives in body's background-image,
    // so a breathing effect would repaint the whole viewport every frame.
    expect(CSS_RULES).not.toContain('@keyframes')
    expect(CSS_RULES.match(/animation:\s*(?!none)\S+/g)).toBeNull()
  })
})

describe('material stylesheet', () => {
  it('anchors the gradient to the viewport', () => {
    expect(CSS).toContain('background-attachment: fixed')
  })

  it('paints three layers: glow, haze, ramp', () => {
    // Scoped to the page rule: the glass section adds its own linear-gradient
    // later in the file, and this test is about the page surface alone.
    expect(PAGE_RULE.match(/radial-gradient\(/g)).toHaveLength(2)
    expect(PAGE_RULE.match(/linear-gradient\(/g)).toHaveLength(1)
  })

  it('keeps full-window dialogs opaque by re-binding the token only', () => {
    expect(CSS).toContain("[role='dialog'][aria-modal='true']")
    expect(CSS).toContain('--dsw-alias-bg-base: var(--dsh-go-page-base)')
  })

  it('never uses !important', () => {
    // Specificity is the whole strategy: an !important would win today and
    // then be impossible to layer against the official theme tomorrow.
    expect(CSS_RULES).not.toContain('!important')
  })
})

/** Independent rgba() formatter, so the test does not echo the implementation. */
function rgba(hex: string, alpha: number): string {
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')'
}
