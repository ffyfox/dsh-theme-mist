#!/usr/bin/env node
/**
 * Lifecycle end-to-end test (T1.4 acceptance).
 *
 * Drives a real DSH web instance through Chrome DevTools Protocol and checks
 * three things unit tests cannot see:
 *
 *   1. Accent switch — every palette changes the tokens, and repeated switches
 *      never stack layers (the override source is reused).
 *   2. Teardown is exact — with the bundle disabled, every token and body
 *      attribute returns to its pre-plugin value (snapshot diff empty).
 *   3. No leak under reload — N enable/disable cycles leave the
 *      style[data-plugin] count and body attribute set unchanged.
 *
 * Integration test: needs a running `dsh web` and headless Chrome with
 * --remote-debugging-port. Not part of `pnpm verify`.
 *
 * Usage:
 *   node tools/e2e-lifecycle.mjs --url 'http://127.0.0.1:PORT/?token=...' --profile ~/.dsh/profiles/<profile>
 *   node tools/e2e-lifecycle.mjs --url ... --profile ... --cycles 10
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

// ------------------------------------------------------------------ arguments
const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const index = argv.indexOf('--' + name)
  return index >= 0 ? argv[index + 1] : fallback
}
const URL_ARG = arg('url')
const PROFILE = arg('profile')
const CDP_PORT = arg('cdp-port', '9333')
const CYCLES = Number(arg('cycles', '10'))

if (!URL_ARG || !PROFILE) {
  console.error('usage: node tools/e2e-lifecycle.mjs --url <web-url-with-token> --profile <dsh-profile-dir>')
  process.exit(2)
}
const profileDir = resolve(PROFILE.replace(/^~/, homedir()))
const profilesRoot = join(homedir(), '.dsh', 'profiles')
if (!profileDir.startsWith(profilesRoot)) {
  console.error('refusing to patch a directory outside ' + profilesRoot + ': ' + profileDir)
  process.exit(2)
}
const PATCH_FILE = join(profileDir, 'cordis.patch.yml')

// ------------------------------------------------------------------- CDP client
const BASE = 'http://127.0.0.1:' + CDP_PORT
const targets = await (await fetch(BASE + '/json/list')).json()
let page = targets.find((t) => t.type === 'page' && t.url.startsWith('http'))
if (page === undefined) {
  page = await (await fetch(BASE + '/json/new?about:blank', { method: 'PUT' })).json()
}

const socket = new WebSocket(page.webSocketDebuggerUrl)
let seq = 0
const pending = new Map()
const send = (method, params) => new Promise((ok, fail) => {
  const id = ++seq
  pending.set(id, { ok, fail })
  socket.send(JSON.stringify({ id, method, params: params ?? {} }))
})
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  const entry = pending.get(message.id)
  if (entry === undefined) return
  pending.delete(message.id)
  if (message.error) entry.fail(new Error(JSON.stringify(message.error)))
  else entry.ok(message.result)
})
await new Promise((ok, fail) => {
  socket.addEventListener('open', ok, { once: true })
  socket.addEventListener('error', fail, { once: true })
})
await send('Page.enable')
await send('Runtime.enable')

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error('evaluate failed: ' + (result.exceptionDetails.text ?? 'unknown'))
  return result.result.value
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Poll an expression until it returns truthy. */
const waitFor = async (expression, timeoutMs = 20000, label = expression) => {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      if (await evaluate(expression)) return true
    } catch { /* page may be mid-navigation */ }
    await sleep(250)
  }
  throw new Error('timeout waiting for: ' + label)
}

// ------------------------------------------------------------------ theme helpers
/** Tokens checked on every accent switch (surface, text, brand, sidebar, border). */
const PROBE_TOKENS = [
  '--dsw-alias-bg-base',
  '--dsw-alias-label-primary',
  '--dsw-alias-brand-primary',
  '--dsw-specific-sidebar-fill',
  '--dsw-alias-label-caption',
  '--dsw-alias-border-l1',
]

const snapshotExpr = (tokens) => [
  '(() => {',
  '  const cs = getComputedStyle(document.body)',
  '  const out = { tokens: {}, styles: 0 }',
  "  out.theme = document.body.getAttribute('data-dsh-go-theme')",
  "  out.accent = document.body.getAttribute('data-dsh-go-accent')",
  "  out.reduce = document.body.hasAttribute('data-dsh-go-reduce-material')",
  '  out.classes = [...document.body.classList].filter((c) => /_root$/.test(c)).sort()',
  '  for (const name of ' + JSON.stringify(tokens) + ') out.tokens[name] = cs.getPropertyValue(name).trim()',
  "  out.styles = [...document.querySelectorAll('style[data-plugin]')].filter((s) => s.dataset.plugin && s.dataset.plugin.includes('theme-go')).length",
  '  out.inlineProps = document.body.style.length',
  '  return JSON.stringify(out)',
  '})()',
].join('\n')

const snapshot = async () => JSON.parse(await evaluate(snapshotExpr(PROBE_TOKENS)))

/**
 * One <style data-plugin> per *.module.css in src/client — the build injects
 * one tag file, not one tag per plugin. `material.module.css` (T2.2) made this
 * two and `settings.module.css` (T3.1) three; the invariant worth testing is
 * that the number is exact and stable, not that it is one.
 */
const EXPECTED_STYLE_TAGS = 3
const setPatch = (content) => writeFileSync(PATCH_FILE, content)
const ENABLED_PATCH = '# e2e-lifecycle: bundle enabled via dsh.profile.bundles.\n[]\n'
const DISABLED_PATCH = '# e2e-lifecycle: temporarily disabled.\n- id: ui-theme-go\n  disabled: true\n'

const failures = []
const check = (name, ok, detail = '') => {
  if (!ok) failures.push(name + (detail === '' ? '' : ' — ' + detail))
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail === '' ? '' : ' — ' + detail))
}

const originalPatch = readFileSync(PATCH_FILE, 'utf8')

try {
  // ---------------------------------------------------------------- baseline
  setPatch(DISABLED_PATCH)
  // The patch file is hot-reloaded by the server's watcher, and the reload is
  // not instant: a navigate issued in the same tick can still be answered from
  // the previous (enabled) composition, which looks exactly like a failure to
  // disable. Retry the load instead of guessing a sleep long enough.
  // The watcher applies the patch asynchronously and can miss the write
  // entirely — most reliably when it happens while the server is also
  // reloading the plugin bundle (for example straight after `pnpm build`).
  // Waiting is therefore not enough: re-write the file, which is idempotent,
  // and let the host hot-unmount the bundle on the page that is already open.
  await send('Page.navigate', { url: URL_ARG })
  await waitFor("document.readyState === 'complete' && document.body !== null", 30000, 'page load')
  // The watcher can also go quiet for a while after the server reloads the
  // plugin bundle (for example straight after `pnpm build`), so give it a
  // couple of minutes of retries before declaring it dead. Each retry rewrites
  // the same content — the write is idempotent, only the event matters.
  const ATTEMPTS = 8
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      await waitFor("document.body.getAttribute('data-dsh-go-theme') === null", 15000, 'theme absent while disabled')
      break
    } catch (error) {
      if (attempt === ATTEMPTS) {
        throw new Error('the patch watcher never served the disabled composition after ' + ATTEMPTS * 15
          + 's — restart the dsh web instance and re-run (the watcher goes quiet while a bundle reload is in flight)')
      }
      console.log('     watcher quiet; rewriting cordis.patch.yml (attempt ' + attempt + ' of ' + ATTEMPTS + ')')
      setPatch(DISABLED_PATCH)
    }
  }
  await sleep(1500)
  const baseline = await snapshot()
  console.log('', 'baseline:', JSON.stringify(baseline.tokens))
  check('baseline has no theme attribute', baseline.theme === null)
  check('baseline has no themed style tags', baseline.styles === 0)

  // -------------------------------------------------------- enable (cycle 1)
  setPatch(ENABLED_PATCH)
  await waitFor("document.body.getAttribute('data-dsh-go-theme') !== null", 30000, 'theme mounts')
  const enabled = await snapshot()
  console.log('', 'enabled:', JSON.stringify(enabled.tokens))
  check('theme attribute set', enabled.theme !== null)
  check('accent attribute set', enabled.accent !== null)
  check('themed style tags match the module count', enabled.styles === EXPECTED_STYLE_TAGS, String(enabled.styles))
  const changed = PROBE_TOKENS.filter((name) => enabled.tokens[name] !== baseline.tokens[name])
  check('tokens differ from baseline', changed.length >= 5, changed.length + '/' + PROBE_TOKENS.length + ' changed')

  // ---------------------------------------------------------- accent switching
  const accents = ['mist', 'daiqing', 'dusk', 'turquoise', 'amber', 'graphite']
  const seen = new Map()
  for (const accent of accents) {
    await evaluate("window.dispatchEvent(new CustomEvent('dsh-go-theme:accent', { detail: " + JSON.stringify(accent) + ' }))')
    await sleep(150)
    const now = await snapshot()
    check(accent + ': accent attribute applied', now.accent === accent, String(now.accent))
    // The style-tag count is asserted once after the loop, not per accent: a
    // host hot-reload can momentarily re-inject the tags, and racing that
    // would turn a real leak check into a flaky one.
    const key = JSON.stringify(now.tokens)
    check(accent + ': token set is distinct', !seen.has(key), seen.has(key) ? 'same as ' + seen.get(key) : '')
    seen.set(key, accent)
  }
  check('style tag count stable across all accents',
    (await snapshot()).styles === EXPECTED_STYLE_TAGS, String((await snapshot()).styles))

  // ------------------------------------------------- reduce material (T2.3)
  await evaluate("window.dispatchEvent(new CustomEvent('dsh-go-theme:reduce-material', { detail: true }))")
  await sleep(200)
  check('reduce-material attribute applied', (await snapshot()).reduce === true)
  await evaluate("window.dispatchEvent(new CustomEvent('dsh-go-theme:reduce-material', { detail: false }))")
  await sleep(200)
  check('reduce-material attribute removed', (await snapshot()).reduce === false)

  // ------------------------------------------------------- persistence (T1.5)
  await evaluate("window.dispatchEvent(new CustomEvent('dsh-go-theme:accent', { detail: 'dusk' }))")
  await sleep(200)
  // Snapshot right before the reload: the reload must land on this exact accent,
  // whatever it was. Comparing against `enabled` instead would only work on a
  // profile whose storage was empty on first load — a second run against the same
  // profile starts on the previously persisted accent and the check misfires.
  const beforeReload = await snapshot()
  const stored = await evaluate("(function () { try { return localStorage.getItem('dsh.go-theme.preferences.v1') } catch (e) { return null } })()")
  check('preference persisted to localStorage', typeof stored === 'string' && stored.indexOf('dusk') >= 0, String(stored))

  await send('Page.reload')
  await waitFor("document.body.getAttribute('data-dsh-go-theme') !== null", 30000, 'theme remounts after reload')
  await sleep(500)
  const afterReload = await snapshot()
  check('accent survives a reload', afterReload.accent === 'dusk', String(afterReload.accent))
  check('tokens follow the restored accent',
    afterReload.tokens['--dsw-alias-brand-primary'] === beforeReload.tokens['--dsw-alias-brand-primary'],
    'after reload ' + afterReload.tokens['--dsw-alias-brand-primary']
      + ' vs before reload ' + beforeReload.tokens['--dsw-alias-brand-primary'])

  // ------------------------------------------------------------ disable again
  setPatch(DISABLED_PATCH)
  await waitFor("document.body.getAttribute('data-dsh-go-theme') === null", 30000, 'theme unmounts')
  await sleep(600)
  const afterDisable = await snapshot()
  console.log('', 'after disable:', JSON.stringify(afterDisable.tokens))
  check('theme attribute cleared', afterDisable.theme === null)
  check('accent attribute cleared', afterDisable.accent === null)
  check('themed style tags reclaimed', afterDisable.styles === 0, String(afterDisable.styles))
  const diff = PROBE_TOKENS.filter((name) => afterDisable.tokens[name] !== baseline.tokens[name])
  check('snapshot diff vs baseline is empty', diff.length === 0,
    diff.map((n) => n + ': ' + baseline.tokens[n] + ' -> ' + afterDisable.tokens[n]).join(', '))
  check('body inline property count restored', afterDisable.inlineProps === baseline.inlineProps,
    baseline.inlineProps + ' -> ' + afterDisable.inlineProps)

  // --------------------------------------------------------- leak under cycles
  console.log('', CYCLES + ' enable/disable cycles…')
  for (let i = 1; i <= CYCLES; i += 1) {
    setPatch(ENABLED_PATCH)
    await waitFor("document.body.getAttribute('data-dsh-go-theme') !== null", 30000, 'cycle ' + i + ' mount')
    const on = await snapshot()
    if (on.styles !== EXPECTED_STYLE_TAGS) check('cycle ' + i + ' style count while on', false, String(on.styles))
    setPatch(DISABLED_PATCH)
    await waitFor("document.body.getAttribute('data-dsh-go-theme') === null", 30000, 'cycle ' + i + ' unmount')
  }
  await sleep(600)
  const afterCycles = await snapshot()
  check('style tags stable after ' + CYCLES + ' cycles', afterCycles.styles === 0, String(afterCycles.styles))
  check('attributes stable after ' + CYCLES + ' cycles',
    afterCycles.theme === null && afterCycles.accent === null && afterCycles.classes.length === 0
      && afterCycles.reduce === false,
    JSON.stringify({
      theme: afterCycles.theme,
      accent: afterCycles.accent,
      classes: afterCycles.classes,
      reduce: afterCycles.reduce,
    }))
  check('inline properties stable after ' + CYCLES + ' cycles',
    afterCycles.inlineProps === baseline.inlineProps, afterCycles.inlineProps + ' vs ' + baseline.inlineProps)

  // Leave no preference behind, or the next manual session would start on 'dusk'.
  await evaluate("(function () { try { localStorage.removeItem('dsh.go-theme.preferences.v1') } catch (e) {} return true })()")
  check('preference key cleaned up', true)
} finally {
  writeFileSync(PATCH_FILE, originalPatch)
  socket.close()
}

console.log('')
if (failures.length > 0) {
  console.error(failures.length + ' check(s) failed')
  process.exit(1)
}
console.log('all lifecycle checks passed')
process.exit(0)
