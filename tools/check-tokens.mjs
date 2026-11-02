#!/usr/bin/env node
/**
 * Guardrails for the token layer.
 *
 * `ctx.theme.overrideTokens` accepts ANY token name — a typo is silently kept
 * and simply never applies (phase 0, docs/reference/phase0-findings.md §1.3).
 * Nothing in the runtime tells you that a name is wrong, so every check that
 * can catch it has to live in the build.
 *
 * Checks:
 *  1. count is exactly 34 (27 alias + 7 specific) — matches visual-spec §8.2
 *  2. every name exists at runtime (docs/reference/token-inventory-runtime.json)
 *  3. no tier-B token (declared on `body, body *` — the override is inert)
 *  4. tier-C tokens are reported as warnings (they apply globally but specific
 *     components keep their own value — usually intentional)
 *  5. nothing from the forbidden list (visual-spec §8.3)
 *  6. buildTokenLayer() returns a complete layer of {light, dark} pairs for
 *     every palette, with CSS-shaped values and no bare strings
 *  7. the --dsh-go-* material variables (T2.2) are namespaced, do not collide
 *     with official tokens, and are all present in every palette's layer
 *
 * Usage: node tools/check-tokens.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = dirname(dirname(fileURLToPath(import.meta.url)))
const EXPECTED_COUNT = 34

/** visual-spec §8.3 — never override these. */
const FORBIDDEN_PREFIXES = ['--dsw-static-', '--dsh-', '--ds-']
const FORBIDDEN_EXACT = new Set([
  '--dsw-elevation-stroke',
  '--dsw-elevation-panel',
  '--dsw-elevation-prominent',
  '--dsw-elevation-soft',
  '--dsw-menu-surface-fill',
  '--dsw-menu-backdrop-filter',
  '--dsw-alias-bg-mask-1',
  '--dsw-focus-ring-color',
])
/** `--dsw-alias-state-*` is forbidden except the business pair we do map. */
const FORBIDDEN_STATE_PREFIX = '--dsw-alias-state-'
const ALLOWED_STATE = new Set(['--dsw-alias-state-business-primary', '--dsw-alias-state-business-tertiary'])

const failures = []
const warnings = []
const check = (name, ok, detail = '') => {
  if (!ok) failures.push(detail === '' ? name : `${name} — ${detail}`)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail === '' ? '' : ' — ' + detail}`)
}

const { TOKEN_NAMES, MATERIAL_VARS, buildTokenLayer } =
  await import(pathToFileURL(join(REPO, 'src', 'client', 'tokens.ts')).href)
const { PALETTES, ACCENT_IDS } = await import(pathToFileURL(join(REPO, 'src', 'client', 'palettes.ts')).href)

const inventory = JSON.parse(readFileSync(join(REPO, 'docs', 'reference', 'token-inventory-runtime.json'), 'utf8'))
const runtime = inventory.tokens

// ------------------------------------------------------------ 1. count/shape
check('token count is 34', TOKEN_NAMES.length === EXPECTED_COUNT, String(TOKEN_NAMES.length))
check('no duplicate names', new Set(TOKEN_NAMES).size === TOKEN_NAMES.length)
const aliasCount = TOKEN_NAMES.filter((n) => n.startsWith('--dsw-alias-')).length
const specificCount = TOKEN_NAMES.filter((n) => n.startsWith('--dsw-specific-')).length
check('27 alias + 7 specific', aliasCount === 27 && specificCount === 7, `${aliasCount} + ${specificCount}`)

// ------------------------------------------------------- 2..4 reachability
const unknown = []
const tierB = []
const tierC = []
for (const name of TOKEN_NAMES) {
  const entry = runtime[name]
  if (entry === undefined) { unknown.push(name); continue }
  if (entry.tier === 'B') tierB.push(name)
  if (entry.tier === 'C') tierC.push(name)
}
check('all names exist at runtime', unknown.length === 0, unknown.join(' '))
check('no tier-B token (body, body * — override is inert)', tierB.length === 0, tierB.join(' '))
for (const name of tierC) {
  warnings.push(`${name} is tier C: applies globally, but some components re-declare it and keep their own value`)
}

// ------------------------------------------------------------ 5. forbidden
const hitPrefix = TOKEN_NAMES.filter((n) => FORBIDDEN_PREFIXES.some((p) => n.startsWith(p)))
check('no forbidden prefix', hitPrefix.length === 0, hitPrefix.join(' '))
const hitExact = TOKEN_NAMES.filter((n) => FORBIDDEN_EXACT.has(n))
check('no forbidden exact token', hitExact.length === 0, hitExact.join(' '))
const hitState = TOKEN_NAMES.filter((n) => n.startsWith(FORBIDDEN_STATE_PREFIX) && !ALLOWED_STATE.has(n))
check('no forbidden state token', hitState.length === 0, hitState.join(' '))

// -------------------------------------------------- 7. material variables
const badNamespace = MATERIAL_VARS.filter((n) => !n.startsWith('--dsh-go-'))
check('material vars are namespaced --dsh-go-*', badNamespace.length === 0, badNamespace.join(' '))
const collision = MATERIAL_VARS.filter((n) => TOKEN_NAMES.includes(n))
check('material vars do not shadow official tokens', collision.length === 0, collision.join(' '))

// --------------------------------------------------------- 6. layer output
const CSS_VALUE = /^(#[0-9A-Fa-f]{3,8}|rgba?\([^)]*\)|color-mix\(in srgb, var\(--dsw-[a-z0-9-]+\) \d+%, transparent\))$/
for (const id of ACCENT_IDS) {
  const layer = buildTokenLayer(PALETTES[id])
  const keys = Object.keys(layer)
  const names = [...TOKEN_NAMES, ...MATERIAL_VARS]
  check(`${id}: layer covers every token and material var`,
    keys.length === names.length && names.every((n) => keys.includes(n)),
    `${keys.length} keys`)

  const bare = []
  const malformed = []
  for (const [name, pair] of Object.entries(layer)) {
    if (pair === null || typeof pair !== 'object' || typeof pair.light !== 'string' || typeof pair.dark !== 'string') {
      bare.push(name)          // a bare string would throw inside overrideTokens
      continue
    }
    for (const scheme of ['light', 'dark']) {
      const value = pair[scheme]
      if (value === '' || !CSS_VALUE.test(value)) malformed.push(`${name}[${scheme}]=${value}`)
    }
  }
  check(`${id}: every value is a {light, dark} pair`, bare.length === 0, bare.join(' '))
  check(`${id}: every value is a CSS colour`, malformed.length === 0, malformed.slice(0, 4).join(' '))
}

for (const w of warnings) console.log('warn ' + w)
console.log('')
if (failures.length > 0) {
  console.error(`${failures.length} check(s) failed`)
  process.exit(1)
}
console.log('all token-layer checks passed')
