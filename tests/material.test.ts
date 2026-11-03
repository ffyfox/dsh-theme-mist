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

describe('page surfaces (T2.7 -> T5.5)', () => {
  const SIDEBAR = '--dsw-specific-sidebar-fill'

  it('leaves the page to the backdrop: bg-base is transparent', () => {
    // The wash this token used to carry sat on top of the gradient at 0.59
    // effective opacity and cut the accent glow to 41% of DSH Go's. Measured
    // in docs/architecture.md §9; the fix is to stop painting there at all.
    for (const id of ACCENT_IDS) {
      const layer = buildTokenLayer(PALETTES[id])
      expect(layer['--dsw-alias-bg-base'].light).toBe('transparent')
      expect(layer['--dsw-alias-bg-base'].dark).toBe('transparent')
    }
  })

  it('binds exactly one official token to alpha', () => {
    for (const id of ACCENT_IDS) {
      const layer = buildTokenLayer(PALETTES[id])
      const translucent = TOKEN_NAMES.filter((name) => RGBA.test(layer[name].light) || RGBA.test(layer[name].dark))
      expect(translucent).toEqual([SIDEBAR])
    }
  })

  it.each(ACCENT_IDS)('%s: the sidebar reproduces upstream fill', (id) => {
    const p = PALETTES[id]
    const layer = buildTokenLayer(p)
    // Fitted against DSH Go's own wide-sidebar goldens, light and dark: the
    // column is a sheet at 0.82 / 0.86, not the 0.40 the wash used to hide.
    // Reproduction error 1.5 and 0.6 / 255 (docs/architecture.md §9).
    expect(layer[SIDEBAR].light).toBe(rgba(p.light.mistLow, 0.82))
    expect(layer[SIDEBAR].dark).toBe(rgba(p.dark.sheetDark, 0.86))
  })

  it.each(ACCENT_IDS)('%s: the sidebar stays liftable from the page', (id) => {
    const layer = buildTokenLayer(PALETTES[id])
    for (const scheme of ['light', 'dark'] as const) {
      expect(layer[SIDEBAR][scheme]).not.toBe(layer['--dsw-alias-bg-base'][scheme])
    }
  })

  it('hands the desktop window frame back to the page (T5.6)', () => {
    // Electron runs with data-windows-titlebar on <html>, and the layout package
    // paints that frame with the sidebar token. Left alone, the 0.82 sheet turns
    // the whole window into a near-opaque wash: measured at 1524x903@2x in mist
    // light, the top-right corner reads 240,244,253 instead of 211,224,253.
    const rule = CSS_RULES.match(/([^{}]*\[data-windows-titlebar\][^{}]*)\{([^}]*)\}/g) ?? []
    const frameRules = rule.filter((text) => text.includes("[data-slot='root']"))
    expect(frameRules.length).toBeGreaterThan(0)
    for (const text of frameRules) {
      expect(text).toContain('background: transparent')
      // Structural hook only: the sidebar column keeps painting the token itself.
      expect(text).not.toMatch(/sidebar-?[cC]ol|_sidebar/iu)
    }
  })
})

describe('sidebar material (T5.7 / T5.8)', () => {
  /** Rules whose selector mentions one marker, comments already stripped. */
  const rulesFor = (marker: string): string[] =>
    (CSS_RULES.match(/[^{}]*\{[^}]*\}/g) ?? []).filter((text) => text.slice(0, text.indexOf('{')).includes(marker))

  it('paints the sheet on the sidebar root, not on the column', () => {
    // The column clips its contents, so a radius there would be squared off; the
    // shape has to live on the root and the column has to stop painting.
    const column = rulesFor("[data-slot='root'] > :has([data-slot='sidebar'])")
    expect(column.some((text) => text.includes('background: transparent'))).toBe(true)

    const root = rulesFor("[data-slot='sidebar'] > :first-child")
    expect(root.length).toBeGreaterThan(0)
    const sheet = root[0]
    // The tier token, so the OS "reduce transparency" path swaps in the opaque
    // fallback without a second rule for this surface.
    expect(sheet).toContain('background-color: var(--dsh-go-sheet-token)')
    // sessions_drawer.dart:198-203 rounds the right-hand corners only.
    expect(sheet).toContain('border-radius: 0 28px 28px 0')
    // The two edge treatments the sheet tier always had (surfaces.dart:216-224).
    expect(sheet).toContain('inset 0 0 0 0.5px var(--dsw-alias-border-l1)')
    expect(sheet).toContain('inset 0 1px 0 var(--dsh-go-highlight)')
  })

  it('keeps the flat variant behind its attribute and neutralises the sheet', () => {
    const flat = rulesFor("[data-dsh-go-sidebar='flat']")
    expect(flat.length).toBe(3)
    const joined = flat.join('\n')
    // Re-pointed inside the subtree so the session list's 24px fade fades to
    // nothing instead of painting a band of sheet colour over the page.
    expect(joined).toContain('--dsw-specific-sidebar-fill: transparent')
    expect(joined).toContain('background-color: transparent')
    expect(joined).toContain('border-radius: 0')
    expect(joined).toContain('box-shadow: none')
    // The hairline that replaces the sheet edge.
    expect(joined).toContain('inset -0.5px 0 0 var(--dsw-alias-border-l1)')
  })

  it('never borrows the host divider weight for the sidebar edge', () => {
    // border-l3 is ink 0.25; upstream draws the sheet's edge at ink 0.07 and the
    // panel's hairline at ink 0.08. A theme rule that reached for l3 would draw
    // a column divider, not a glass edge.
    const sidebar = (CSS_RULES.match(/[^{}]*\{[^}]*\}/g) ?? [])
      .filter((text) => /data-slot='sidebar'|data-dsh-go-sidebar='flat'/u.test(text.slice(0, text.indexOf('{'))))
    expect(sidebar.length).toBeGreaterThan(0)
    for (const text of sidebar) expect(text).not.toContain('border-l3')
  })
})

describe('composer seat and popovers (T5.9)', () => {
  /** Rules whose selector mentions one marker, comments already stripped. */
  const rulesFor = (marker: string): string[] =>
    (CSS_RULES.match(/[^{}]*\{[^}]*\}/g) ?? []).filter((text) => text.slice(0, text.indexOf('{')).includes(marker))

  it('steps the frosted seat out of the way while a popover is open', () => {
    // The popover is rendered inside the seat, and a backdrop-filter on an
    // ancestor is a backdrop root: the popover's own blur would sample the
    // seat's paint instead of the page. Same for the seat's veil, which paints
    // the page colour at full opacity. Both have to stand down while one is open.
    const rules = rulesFor(':has([data-menu-material])')
    expect(rules.length).toBe(2)
    const joined = rules.join('\n')
    expect(joined).toContain('backdrop-filter: none')
    expect(joined).toContain('display: none')
    // Scoped to the seat: the sidebar column and the page keep their paint.
    for (const text of rules) expect(text.slice(0, text.indexOf('{'))).toContain("[data-composer-seat]")
  })

  it('keeps the seat frosted when nothing is open', () => {
    // The rule that turns the frost on must not be carrying the popover
    // condition itself, or the seat would lose its blur permanently.
    const base = rulesFor("[data-composer-seat][data-conversation-region='composer']")
    const blurOn = base.filter((text) => text.includes('backdrop-filter: var(--dsh-go-glass-blur)'))
    expect(blurOn.length).toBe(1)
    expect(blurOn[0]).not.toContain(':has(')
  })
})

describe('glass tiers (T5.5)', () => {
  it.each(ACCENT_IDS)('%s: card and pill are white glass, sheet follows the palette', (id) => {
    const p = PALETTES[id]
    const layer = buildTokenLayer(p)
    // surfaces.dart:157-158: the glass stays white whatever the accent — only
    // the page underneath changes hue.
    expect(layer['--dsh-go-card-fill'].light).toBe('rgba(255, 255, 255, 0.62)')
    expect(layer['--dsh-go-card-fill'].dark).toBe('rgba(255, 255, 255, 0.05)')
    expect(layer['--dsh-go-pill-fill'].light).toBe('rgba(255, 255, 255, 0.55)')
    expect(layer['--dsh-go-pill-fill'].dark).toBe('rgba(255, 255, 255, 0.06)')
    expect(layer['--dsh-go-sheet-fill'].light).toBe(rgba(p.light.mistLow, 0.82))
    expect(layer['--dsh-go-sheet-fill'].dark).toBe(rgba(p.dark.sheetDark, 0.86))
  })

  it.each(ACCENT_IDS)('%s: the blurred tiers keep a near-opaque fallback', (id) => {
    const layer = buildTokenLayer(PALETTES[id])
    // Only the tiers that blur need one: without it, scrolling text would run
    // into the input line and the menus (surfaces.dart:38-41).
    expect(alphaOf(layer['--dsh-go-chrome-solid'].light)).toBeGreaterThanOrEqual(0.95)
    expect(alphaOf(layer['--dsh-go-chrome-solid'].dark)).toBeGreaterThanOrEqual(0.95)
    expect(RGBA.test(layer['--dsh-go-sheet-solid'].light)).toBe(false)
    expect(RGBA.test(layer['--dsh-go-sheet-solid'].dark)).toBe(false)
    // card and pill use upstream's fallbackFill verbatim: still translucent.
    expect(layer['--dsh-go-card-solid'].light).toBe('rgba(255, 255, 255, 0.72)')
    expect(layer['--dsh-go-card-solid'].dark).toBe('rgba(255, 255, 255, 0.06)')
    expect(layer['--dsh-go-pill-solid'].light).toBe('rgba(255, 255, 255, 0.66)')
    expect(layer['--dsh-go-pill-solid'].dark).toBe('rgba(255, 255, 255, 0.07)')
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

  it('keeps two OS-level degradation paths, all re-declared on the surfaces', () => {
    expect(CSS).toContain('@supports not (backdrop-filter: blur(1px))')
    expect(CSS).toContain('prefers-reduced-transparency: reduce')
    // The in-app switch that used to be the third path was removed: it changed
    // tokens whose values the page underneath made invisible (max 3/255).
    expect(CSS).not.toContain('data-dsh-go-reduce-material')
    // Regression guard for two measured traps:
    //  1. declaring the variables on body only is not enough — Chromium will
    //     not re-resolve an inherited custom property inside a gradient;
    //  2. a bare attribute selector loses to the official
    //     .root[data-phase=active] .composerSeat rule.
    expect(CSS.split('--dsh-go-veil-mask: none').length - 1).toBe(2)
    expect(CSS.split('--dsh-go-glass-fill: var(--dsh-go-chrome-solid)').length - 1).toBe(2)
    // The tiers follow the same paths, or a reduced-transparency card would keep
    // its translucent fill over an unblurred backdrop.
    expect(CSS.split('--dsh-go-card-token: var(--dsh-go-card-solid)').length - 1).toBe(2)
    expect(CSS.split('--dsh-go-sheet-token: var(--dsh-go-sheet-solid)').length - 1).toBe(2)
    expect(CSS.split('--dsh-go-pill-token: var(--dsh-go-pill-solid)').length - 1).toBe(2)
  })
})

describe('card, pill and elevation (T2.4 / T2.5)', () => {
  /** The card/pill section: from the first card rule to the elevation block. */
  // Last occurrence: the tier re-binds earlier in the sheet also mention the
  // bubble, and they are not part of this section.
  const CARD_SECTION = CSS_RULES.slice(
    CSS_RULES.lastIndexOf('[data-message-bubble]'),
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

  it('gives full-window dialogs the sheet tier by re-binding the token only', () => {
    // The dialog's own surfaces read bg-base; re-binding it hands them the
    // sheet fill without us painting anyone else's background.
    expect(CSS).toContain("[role='dialog'][aria-modal='true']")
    expect(CSS).toContain('--dsw-alias-bg-base: var(--dsh-go-sheet-token)')
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
