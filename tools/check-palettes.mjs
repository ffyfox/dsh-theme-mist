#!/usr/bin/env node
/**
 * Contract checks for the generated palette module.
 *
 * 1. **Drift** — regenerates into a temp dir and compares the result with
 *    `src/client/palettes.ts`. Catches hand edits to an auto-generated file.
 * 2. **Derivation rules** — the two derived values that the generator must
 *    produce (and that a careless edit would break):
 *      - dark `caption` = mix(paperFaint, paperGhost, 0.30), six known hexes
 *      - light `caption` === `light.inkFaint` (the ramp has no fifth level)
 *      - `hairline` = four alphas, light on shadowInk, dark on white
 * 3. **Colour format** — Flutter writes #AARRGGBB, CSS wants #RRGGBBAA.
 *    A regression here is silent (a translucent white reads as near-transparent
 *    blue), so the one known translucent token is pinned.
 *
 * Usage: node tools/check-palettes.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = dirname(dirname(fileURLToPath(import.meta.url)))
const TARGET = join(REPO, 'src', 'client', 'palettes.ts')

/** Documented dark captions, in ACCENT_IDS order (visual-spec §6.1 / §6.2). */
const EXPECTED_DARK_CAPTIONS = ['#8A8E98', '#879096', '#8F8C96', '#879190', '#928D87', '#8D8E91']
const EXPECTED_IDS = ['mist', 'daiqing', 'dusk', 'turquoise', 'amber', 'graphite']
/** Light hairlines use shadowInk (11,21,45); dark uses white. */
const EXPECTED_HAIRLINE = {
  light: ['rgba(11,21,45,0.08)', 'rgba(11,21,45,0.12)', 'rgba(11,21,45,0.25)', 'rgba(11,21,45,0.30)'],
  dark: ['rgba(255,255,255,0.09)', 'rgba(255,255,255,0.15)', 'rgba(255,255,255,0.28)', 'rgba(255,255,255,0.34)'],
}
const EXPECTED_COUNTS = { light: 25, dark: 26, accent: 17 }

const failures = []
const check = (name, ok, detail = '') => {
  if (!ok) failures.push(detail === '' ? name : `${name} — ${detail}`)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail === '' ? '' : ' — ' + detail}`)
}

/** Strip the wall-clock provenance line so two runs compare equal. */
const stable = (text) => text.replace(/^export const GENERATED_IN_SECONDS = .*$/m, '')

// ---------------------------------------------------------------- 1. drift
const tmp = mkdtempSync(join(tmpdir(), 'dshgp-'))
try {
  execFileSync('python3', [join(REPO, 'tools', 'derive-tokens.py')], {
    env: { ...process.env, DSHGO_OUT_DIR: tmp, DSHGO_TS_DIR: tmp },
    stdio: 'pipe',
  })
  const fresh = stable(readFileSync(join(tmp, 'palettes.ts'), 'utf8'))
  const committed = stable(readFileSync(TARGET, 'utf8'))
  check('palettes.ts matches the generator output', fresh === committed,
    fresh === committed ? '' : 'run: python3 tools/derive-tokens.py')
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

// --------------------------------------------------------- 2. derived values
const source = readFileSync(TARGET, 'utf8')

const blockOf = (id) => {
  const start = source.indexOf(`  ${id}: {`)
  if (start < 0) return ''
  const next = EXPECTED_IDS.map((x) => source.indexOf(`  ${x}: {`)).filter((i) => i > start).sort((a, b) => a - b)[0]
  // Unindented closing brace ends the PALETTES object literal.
  const end = next ?? source.indexOf('\n}\n', start) + 1
  return source.slice(start, end)
}

EXPECTED_IDS.forEach((id, index) => {
  const block = blockOf(id)
  const cap = block.match(/caption: \{ light: "([^"]+)", dark: "([^"]+)" \}/)
  check(`${id}: caption present`, cap !== null)
  if (cap === null) return
  check(`${id}: dark caption = ${EXPECTED_DARK_CAPTIONS[index]}`, cap[2] === EXPECTED_DARK_CAPTIONS[index], cap[2])
  const inkFaint = block.match(/inkFaint: "([^"]+)"/)
  check(`${id}: light caption === inkFaint`, inkFaint !== null && cap[1] === inkFaint[1], cap[1])

  // rgba() contains commas, so split on the function calls rather than on commas.
  const hairColors = [...block.matchAll(/rgba\([^)]+\)/g)].map((m) => m[0])
  check(`${id}: hairline present`, hairColors.length === 8)
  if (hairColors.length !== 8) return
  const light = hairColors.slice(0, 4)
  const dark = hairColors.slice(4)
  check(`${id}: hairline light alphas`, JSON.stringify(light) === JSON.stringify(EXPECTED_HAIRLINE.light), light.join(' '))
  check(`${id}: hairline dark alphas`, JSON.stringify(dark) === JSON.stringify(EXPECTED_HAIRLINE.dark), dark.join(' '))

  const count = (re) => (block.match(re) || []).length
  const lightCount = count(/^\s{6}\w+: "/gm)
  check(`${id}: token counts`, lightCount === EXPECTED_COUNTS.light + EXPECTED_COUNTS.dark + EXPECTED_COUNTS.accent,
    `got ${lightCount}`)
})

check('six palettes present', EXPECTED_IDS.every((id) => source.includes(`  ${id}: {`)))

// -------------------------------------------------------- 3. colour format
const slate = source.match(/slateContainerDark: "([^"]+)"/)
check('ARGB→RGBA conversion (slateContainerDark)', slate !== null && slate[1] === '#FFFFFF17',
  slate === null ? 'missing' : `${slate[1]} (Flutter source is #17FFFFFF)`)

const badHex = [...source.matchAll(/"[#][0-9A-Fa-f]{8}"/g)].map((m) => m[0])
check('no 8-digit hex outside the pinned translucent token', badHex.length <= 1, badHex.join(' '))


// -------------------------------------------------- 4. contrast (T1.2 gates)
const paletteJson = JSON.parse(readFileSync(join(REPO, 'docs', 'reference', 'palette.json'), 'utf8'))

const keyFailures = paletteJson.contrast.key_failures_below_4_5
check('no key contrast pair below 4.5', keyFailures.length === 0,
  keyFailures.map((k) => `${k.accent}/${k.label} ${k.ratio}`).join(', '))

/** WCAG 2.x relative luminance for a #RRGGBB string. */
const relLum = (hex) => {
  const channel = (i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}
const contrast = (a, b) => {
  const [x, y] = [relLum(a), relLum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

for (const id of EXPECTED_IDS) {
  const block = blockOf(id)
  const capDark = block.match(/caption: \{ light: "[^"]+", dark: "([^"]+)" \}/)[1]
  const night = block.match(/night: "([^"]+)"/)[1]
  const tertiaryDark = block.match(/paperFaint: "([^"]+)"/)[1]
  const r = contrast(capDark, night)
  check(`${id}: dark caption on night >= 4.5`, r >= 4.5, r.toFixed(2))
  check(`${id}: dark caption differs from tertiary`, capDark !== tertiaryDark, capDark)
}

console.log('')
if (failures.length > 0) {
  console.error(`${failures.length} check(s) failed`)
  process.exit(1)
}
console.log('all palette contract checks passed')
