#!/usr/bin/env node
/**
 * Degraded-mode check (T4.2): a host without `ctx.theme.overrideTokens`.
 *
 * The unit tests cover the writer's contract; this covers the part only a
 * browser can answer — that the material layer still paints when the official
 * tokens are never touched. It loads the real `lib/client.js` into a stub module
 * loader with a fake context whose theme service has no `overrideTokens`, then
 * asserts the document from the outside.
 *
 * Usage: `node tools/e2e-degraded.mjs [--chrome <path>] [--keep]`
 * Requires `pnpm build` (reads `lib/client.js`).
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = dirname(dirname(fileURLToPath(import.meta.url)))
const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const index = argv.indexOf('--' + name)
  return index >= 0 ? argv[index + 1] : fallback
}
const CHROME = arg('chrome', process.env.CHROME_PATH ?? 'google-chrome-stable')
const KEEP = argv.includes('--keep')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const BUNDLE = join(REPO, 'lib', 'client.js')
if (!existsSync(BUNDLE)) {
  console.error('lib/client.js is missing — run pnpm build first')
  process.exit(2)
}
const bundle = await readFile(BUNDLE, 'utf8')
/** Module id the loader should see; read from the manifest so a rename stays a one-line change. */
const EXPECTED_ID = JSON.parse(await readFile(join(REPO, 'package.json'), 'utf8')).name

/* The page: a stub module loader plus a fake context. The React shim is inert —
   the settings rows are registered through `slots.inject`, which this fake never
   calls back, so nothing renders. It exists only so the bundle's top-level
   `require('react')` has something to bind. */
const HTML = "<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <title>dsh-theme-mist degraded harness</title>\n    <style>\n      html { color-scheme: light dark; }\n      body { margin: 0; min-height: 100vh; }\n    </style>\n  </head>\n  <body>\n    <div id=\"probe\">degraded harness</div>\n    <script>\n      window.__warnings = []\n      window.__shim = new Proxy({}, { get: (target, key) => (target[key] ??= () => ({ type: String(key), args: [] })) })\n      window.__ModuleLoader__ = {\n        load(definition) {\n          window.__pluginId = definition.id\n          window.__plugin = definition.factory((name) => {\n            if (name === 'react' || name === 'react/jsx-runtime') return window.__shim\n            throw new Error('unexpected external: ' + name)\n          })\n        },\n      }\n    </script>\n    <script src=\"/client.js\"></script>\n    <script>\n      ;(() => {\n        const disposers = []\n        const ctx = {\n          effect: (fn) => { const dispose = fn(); disposers.push(dispose); return dispose },\n          theme: {},\n          locale: { register: () => () => {} },\n          slots: { inject: (key) => { (window.__injected ??= []).push(key) } },\n          logger: { warn: (message) => window.__warnings.push(String(message)) },\n        }\n        try {\n          window.__plugin.apply(ctx)\n          window.__result = { ok: true }\n        } catch (error) {\n          window.__result = { ok: false, error: String(error) }\n        }\n        window.__dispose = () => { for (const dispose of disposers) if (typeof dispose === 'function') dispose() }\n      })()\n    </script>\n  </body>\n</html>\n"

const server = createServer((request, response) => {
  if (request.url === '/client.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
    response.end(bundle)
    return
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  response.end(HTML)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const PAGE_PORT = server.address().port

const debugPort = 9400 + Math.floor(Math.random() * 400)
const profile = await mkdtemp(join(tmpdir(), 'dsh-theme-mist-degraded-'))
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=' + debugPort,
    '--user-data-dir=' + profile,
    '--window-size=1280,800',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

/** Poll the DevTools endpoint until Chrome answers. */
async function waitForChrome() {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch( 'http://127.0.0.1:' + debugPort + '/json/version')
      if (response.ok) return
    } catch {}
    await sleep(150)
  }
  throw new Error('Chrome did not expose the DevTools endpoint')
}

const failures = []
let checks = 0
const check = (name, ok, detail) => {
  checks += 1
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail === undefined ? '' : ' — ' + detail))
  if (!ok) failures.push(name)
}

let socket
try {
  await waitForChrome()
  const targets = await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json()
  const page = targets.find((target) => target.type === 'page')
  socket = new WebSocket(page.webSocketDebuggerUrl)
  let sequence = 0
  const pending = new Map()
  const exceptions = []
  const send = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++sequence
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params: params ?? {} }))
    })
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.method === 'Runtime.exceptionThrown') {
      exceptions.push(String(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text))
    }
    const entry = pending.get(message.id)
    if (entry === undefined) return
    pending.delete(message.id)
    if (message.error) entry.reject(new Error(JSON.stringify(message.error)))
    else entry.resolve(message.result)
  })
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  await send('Page.enable')
  await send('Runtime.enable')
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) {
      const details = result.exceptionDetails
      throw new Error(String(details.exception?.description ?? details.text))
    }
    return result.result.value
  }

  await send('Page.navigate', { url: 'http://127.0.0.1:' + PAGE_PORT + '/' })
  for (let attempt = 0; attempt < 150; attempt++) {
    if (await evaluate('Boolean(window.__result)')) break
    await sleep(100)
  }
  await sleep(400)

  const state = await evaluate(`(() => {
    const style = getComputedStyle(document.body)
    const inline = Array.from(document.body.style)
    const goInline = inline.filter((name) => name.startsWith('--dsh-theme-mist-'))
    const tags = [...document.querySelectorAll('style[data-plugin]')].map((tag) => tag.getAttribute('data-plugin'))
    return {
      pluginId: window.__pluginId,
      result: window.__result,
      warnings: window.__warnings,
      injected: window.__injected ?? [],
      themed: document.body.hasAttribute('data-dsh-theme-mist'),
      accent: document.body.getAttribute('data-dsh-theme-mist-accent'),
      pageBase: style.getPropertyValue('--dsh-theme-mist-page-base').trim(),
      glow: style.getPropertyValue('--dsh-theme-mist-glow').trim(),
      backgroundImage: style.backgroundImage,
      inlineDsw: inline.filter((name) => name.startsWith('--dsw-')),
      goInline,
      goPairs: goInline.every((name) => style.getPropertyValue(name).trim().startsWith('light-dark(')),
      styleTags: tags,
    }
  })()`)

  check('the bundle loads through the stub loader', state.pluginId === EXPECTED_ID, state.pluginId)
  check('apply() survives a theme service without overrideTokens', state.result?.ok === true, JSON.stringify(state.result))
  check('exactly one warning naming the missing capability', state.warnings.length === 1 && /overrideTokens/.test(state.warnings[0]), JSON.stringify(state.warnings))
  check('the warning goes through ctx.logger, not the console', /^dsh-theme-mist: /.test(state.warnings[0] ?? ''), state.warnings[0])
  check('the scope attribute and accent are still set', state.themed && state.accent === 'mist', state.themed + ' / ' + state.accent)
  check('settings rows are still registered', state.injected.filter((key) => key === 'settings.general.item').length === 2, JSON.stringify(state.injected))
  // At least the original nine, and every one of them a pair: the exact count
  // moves whenever a glass tier is added (T5.5 took it 9 -> 15).
  check('every material variable carries a light-dark() pair', state.goInline.length >= 9 && state.goPairs, state.goInline.length + ' vars, pairs=' + state.goPairs + ', e.g. ' + state.pageBase)
  check('no official token is overridden by hand', state.inlineDsw.length === 0, JSON.stringify(state.inlineDsw))
  check('the page gradient still paints', /gradient/.test(state.backgroundImage), state.backgroundImage.slice(0, 90))
  check('the material stylesheet is injected', state.styleTags.some((tag) => typeof tag === 'string' && tag.includes(EXPECTED_ID)), JSON.stringify(state.styleTags))
  check('no uncaught exception', exceptions.length === 0, JSON.stringify(exceptions))

  const after = await evaluate(`(() => {
    window.__dispose()
    const style = getComputedStyle(document.body)
    return {
      themed: document.body.hasAttribute('data-dsh-theme-mist'),
      accent: document.body.getAttribute('data-dsh-theme-mist-accent'),
      inline: Array.from(document.body.style).filter((name) => name.startsWith('--dsh-theme-mist-')),
      backgroundImage: style.backgroundImage,
    }
  })()`)
  check('teardown drops the attributes', !after.themed && after.accent === null, JSON.stringify({ themed: after.themed, accent: after.accent }))
  check('teardown drops the inline material variables', after.inline.length === 0, JSON.stringify(after.inline))
  check('teardown drops the gradient', !/gradient/.test(after.backgroundImage), after.backgroundImage.slice(0, 60))
} finally {
  socket?.close()
  chrome.kill('SIGKILL')
  server.close()
  if (!KEEP) await rm(profile, { recursive: true, force: true })
}

console.log(failures.length === 0 ? 'ALL PASS (' + checks + ' checks)' : 'FAILURES: ' + failures.join(' | '))
process.exit(failures.length === 0 ? 0 : 1)
