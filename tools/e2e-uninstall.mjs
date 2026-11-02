#!/usr/bin/env node
/**
 * Uninstall cleanliness audit (T4.4): the four assertions from the plan, run
 * against a live client instead of a fake document.
 *
 * The unit test (tests/uninstall-audit.test.ts) can prove that apply() reverts
 * what it wrote. It cannot prove the two things a theme usually leaves behind:
 * that the *host* puts its own inline values back, and that the host reclaims the
 * three style[data-plugin-css] tags our bundle injects at factory time. So this
 * script drives a real 0.2.1 instance and measures the document from outside:
 *
 *   1. token snapshot diff — every token the layer writes, as computed values,
 *      plus the whole body inline declaration (name, value *and* priority);
 *   2. body attributes — scope, accent and reduce-material;
 *   3. style tags — ours must be gone from <head>;
 *   4. own nodes — nothing may still carry the scope attribute.
 *
 * Isolation: it invents a throwaway DSH_HOME and profile, links this checkout
 * into it, and toggles the plugin through the profile's cordis.patch.yml, which
 * the server hot-applies. No real profile is touched, no app is restarted, and
 * the temporary tree is removed afterwards.
 *
 * Usage: node tools/e2e-uninstall.mjs [--dsh <path>] [--chrome <path>] [--shots <dir>] [--keep]
 * Requires 'pnpm build' (the profile links to this checkout, so lib/client.js is
 * what actually gets audited).
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = dirname(dirname(fileURLToPath(import.meta.url)))
const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const index = argv.indexOf('--' + name)
  return index >= 0 ? argv[index + 1] : fallback
}
const KEEP = argv.includes('--keep')
const PKG = '@dsh-external/dsh-client-ui-theme-go'
const DSH = arg('dsh', 'dsh')
const CHROME = arg('chrome', process.env.CHROME_PATH ?? 'google-chrome-stable')
const SHOTS = arg('shots', join(REPO, 'docs', 'reference', 't44-preview'))
const PROFILE_NAME = 'unaudit'
const PREFERENCES_KEY = 'dsh.go-theme.preferences.v1'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const BUNDLE = join(REPO, 'lib', 'client.js')
if (!existsSync(BUNDLE)) {
  console.error('lib/client.js is missing — run pnpm build first')
  process.exit(2)
}
await mkdir(SHOTS, { recursive: true })

/** Every custom property the layer can write, read off the bundle so it stays in sync. */
const BUNDLE_TEXT = await readFile(BUNDLE, 'utf8')
const TOKENS = [...new Set([...BUNDLE_TEXT.matchAll(/--(?:dsw|dsh-go)-[a-z0-9-]+/g)].map((match) => match[0]))].sort()

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })

const children = []
const start = (command, args, options) => {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options })
  children.push(child)
  child.output = ''
  child.stdout?.on('data', (chunk) => {
    child.output += String(chunk)
  })
  child.stderr?.on('data', (chunk) => {
    child.output += String(chunk)
  })
  return child
}

/** Wait for the "dsh web: <url>" line the CLI prints once it listens. */
async function waitForUrl(child, label) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const match = child.output.match(/http:\/\/127\.0\.0\.1:(\d+)\/\?token=[\w-]+/)
    if (match !== null) return match[0]
    if (child.exitCode !== null) throw new Error(label + ' exited: ' + child.output.slice(-600))
    await sleep(200)
  }
  throw new Error(label + ' never printed a URL: ' + child.output.slice(-600))
}

/** Minimal CDP client: evaluate and screenshot. */
class Session {
  constructor(socket) {
    this.socket = socket
    this.sequence = 0
    this.pending = new Map()
    this.exceptions = []
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params.exceptionDetails
        this.exceptions.push(String(details.exception?.description ?? details.text))
      }
      const entry = this.pending.get(message.id)
      if (entry === undefined) return
      this.pending.delete(message.id)
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)))
      else entry.resolve(message.result)
    })
  }

  static async connect(port) {
    for (let attempt = 0; attempt < 150; attempt++) {
      try {
        const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()
        const page = targets.find((target) => target.type === 'page')
        if (page !== undefined) {
          const socket = new WebSocket(page.webSocketDebuggerUrl)
          await new Promise((resolve, reject) => {
            socket.addEventListener('open', resolve, { once: true })
            socket.addEventListener('error', reject, { once: true })
          })
          const session = new Session(socket)
          await session.send('Page.enable')
          await session.send('Runtime.enable')
          return session
        }
      } catch {}
      await sleep(150)
    }
    throw new Error('no DevTools page target on port ' + port)
  }

  send(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params: params ?? {} }))
    })
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) {
      const details = result.exceptionDetails
      throw new Error(String(details.exception?.description ?? details.text))
    }
    return result.result.value
  }

  /**
   * Poll an expression until it is truthy. A hot reload can navigate the page out
   * from under an evaluation, so a throw here means "try again", not "failed".
   */
  async waitFor(expression, timeoutMs, label) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      try {
        if (await this.evaluate(expression)) return true
      } catch {}
      await sleep(250)
    }
    throw new Error('timeout waiting for: ' + label)
  }

  async shot(path) {
    const result = await this.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(path, Buffer.from(result.data, 'base64'))
  }
}

/**
 * Runs in the page. Everything the audit compares comes back in one object, so a
 * single round trip cannot see two different moments.
 */
function snapshotInPage(payload) {
  const { tokens, pkg } = payload
  const body = document.body
  const style = getComputedStyle(body)
  const computed = {}
  for (const name of tokens) computed[name] = style.getPropertyValue(name).trim()
  const inline = {}
  for (const name of Array.from(body.style)) {
    inline[name] = body.style.getPropertyValue(name) + ' |' + body.style.getPropertyPriority(name)
  }
  const count = (selector) => document.querySelectorAll(selector).length
  return {
    computed,
    inline,
    marked: body.hasAttribute('data-dsh-go-theme'),
    accent: body.getAttribute('data-dsh-go-accent'),
    reduce: body.hasAttribute('data-dsh-go-reduce-material'),
    bodyClasses: [...body.classList],
    ourStyleTags: count('style[data-plugin*="' + pkg + '"]'),
    ourStyleTagsCss: count('style[data-plugin-css*="' + pkg + '"]'),
    allStyleTags: count('style'),
    adopted: document.adoptedStyleSheets.length,
    markedNodes: count('[data-dsh-go-theme]'),
    accentNodes: count('[data-dsh-go-accent], [data-dsh-go-reduce-material]'),
    goInline: Array.from(body.style).filter((name) => name.startsWith('--dsh-go-')).length,
    bodyInlineCount: body.style.length,
  }
}

const SNAPSHOT = (pkg) =>
  '(' + snapshotInPage.toString() + ')(' + JSON.stringify({ tokens: TOKENS, pkg }) + ')'

/** A diff that names what moved is worth more than a boolean. */
function diffMaps(before, after, limit = 6) {
  const out = []
  for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[name] !== after[name]) {
      out.push(name + ': ' + JSON.stringify(before[name]) + ' -> ' + JSON.stringify(after[name]))
    }
  }
  return { count: out.length, sample: out.slice(0, limit).join(' | ') }
}

/* ------------------------------------------------------------------- run */

const temporaryHome = await mkdtemp(join(tmpdir(), 'dsh-go-uninstall-'))
const chromeProfile = await mkdtemp(join(tmpdir(), 'dsh-go-uninstall-chrome-'))
const debugPort = await freePort()
const profileDir = join(temporaryHome, 'profiles', PROFILE_NAME)
const PATCH_FILE = join(profileDir, 'cordis.patch.yml')

/** The patch layer, in both states. The disabled form is what "uninstalled" means here. */
const PATCH_ENABLED = '# e2e-uninstall: bundle enabled through dsh.profile.bundles.\n[]\n'
const PATCH_DISABLED = '# e2e-uninstall: plugin disabled — the audit measures this state.\n- id: ui-theme-go\n  disabled: true\n'

const failures = []
let checks = 0
const check = (name, ok, detail) => {
  checks += 1
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail === undefined ? '' : ' — ' + detail))
  if (!ok) failures.push(name)
}

let session
try {
  await mkdir(join(profileDir, 'node_modules', '@dsh-external'), { recursive: true })
  await writeFile(
    join(profileDir, 'package.json'),
    JSON.stringify(
      {
        name: 'unaudit-profile',
        private: true,
        type: 'module',
        dependencies: { [PKG]: 'link:' + REPO },
        dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', PKG] } },
      },
      null,
      2,
    ) + '\n',
  )
  await writeFile(join(profileDir, 'cordis.yml'), '[]\n')
  await symlink(REPO, join(profileDir, 'node_modules', '@dsh-external', 'dsh-client-ui-theme-go'), 'dir')
  await writeFile(PATCH_FILE, PATCH_DISABLED)

  const port = await freePort()
  const server = start(DSH, ['--profile', PROFILE_NAME, '--no-open', '--port', String(port)], {
    env: { ...process.env, DSH_HOME: temporaryHome },
  })
  const url = await waitForUrl(server, 'audit instance')

  start(
    CHROME,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=' + debugPort,
      '--user-data-dir=' + chromeProfile,
      '--window-size=1440,900',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  session = await Session.connect(debugPort)

  /**
   * Apply a patch state and wait for it to land.
   *
   * The profile watcher goes quiet sometimes (most often while the server reloads
   * a plugin bundle), and a single missed write looks exactly like a failed
   * uninstall. Rewriting the same content is idempotent and only re-emits the
   * event, so retry that instead of guessing a longer sleep.
   */
  const toggle = async (content, predicate, label, timeoutMs = 20000) => {
    const attempts = 6
    for (let attempt = 1; attempt <= attempts; attempt++) {
      await writeFile(PATCH_FILE, content)
      try {
        await session.waitFor(predicate, timeoutMs, label)
        return
      } catch (error) {
        if (attempt === attempts) throw error
        console.log('     watcher quiet; rewriting cordis.patch.yml (attempt ' + attempt + ' of ' + attempts + ')')
      }
    }
  }

  const snapshot = async () => session.evaluate(SNAPSHOT(PKG))
  const MOUNTED = 'document.body.hasAttribute("data-dsh-go-theme")'
  const UNMOUNTED = 'document.body.getAttribute("data-dsh-go-theme") === null'

  // ------------------------------------------------------------- baseline
  await session.send('Page.navigate', { url })
  await session.waitFor('document.readyState === "complete" && !!document.querySelector("[data-slot=sidebar]")', 60000, 'client shell')
  await sleep(2500)
  const baseline = await snapshot()
  const official = TOKENS.filter((name) => baseline.computed[name] !== '')
  check('the shell is up and the plugin is absent', baseline.marked === false && baseline.ourStyleTags === 0, 'marked=' + baseline.marked + ', tags=' + baseline.ourStyleTags)
  check('official tokens are readable, so the diff has something to compare', official.length >= 20, official.length + ' of ' + TOKENS.length + ' names resolve')
  console.log('info baseline: body inline ' + baseline.bodyInlineCount + ' properties, ' + baseline.allStyleTags + ' style tags, ' + baseline.adopted + ' adopted sheets')

  // ---------------------------------------------------------------- mount
  await toggle(PATCH_ENABLED, MOUNTED, 'theme mounts')
  await sleep(1200)
  const mounted = await snapshot()
  check('the theme mounts through the patch layer', mounted.marked === true && mounted.accent !== null, 'accent=' + mounted.accent)
  check('three of our stylesheets are injected', mounted.ourStyleTags === 3 && mounted.ourStyleTagsCss === 3, mounted.ourStyleTags + ' / ' + mounted.ourStyleTagsCss)
  const changedWhileMounted = TOKENS.filter((name) => mounted.computed[name] !== baseline.computed[name])
  check('the layer reaches the document', changedWhileMounted.length >= 40, changedWhileMounted.length + ' of ' + TOKENS.length + ' tokens changed')
  check('the inline layer is on body', mounted.bodyInlineCount > baseline.bodyInlineCount, baseline.bodyInlineCount + ' -> ' + mounted.bodyInlineCount)
  const scopeClass = mounted.bodyClasses.find((name) => /_root$/.test(name))
  check('the scope class lands on body', typeof scopeClass === 'string', String(scopeClass))
  check('the scope attribute marks exactly one node', mounted.markedNodes === 1, String(mounted.markedNodes))
  await session.shot(join(SHOTS, '01-mounted.png'))

  // A second layer before the audit: the accent switch rebuilds the layer, and the
  // audit must be comparing against the official values, not against our first write.
  await session.evaluate('window.dispatchEvent(new CustomEvent("dsh-go-theme:accent", { detail: "graphite" }))')
  await sleep(600)
  await session.evaluate('window.dispatchEvent(new CustomEvent("dsh-go-theme:accent", { detail: "dusk" }))')
  await sleep(600)
  const switched = await snapshot()
  check('the accent switch rewrote the layer', switched.accent === 'dusk' && switched.computed['--dsw-alias-brand-primary'] !== mounted.computed['--dsw-alias-brand-primary'], switched.accent)

  // ------------------------------------------------------------ uninstall
  await toggle(PATCH_DISABLED, UNMOUNTED, 'theme unmounts')
  await sleep(1500)
  const uninstalled = await snapshot()

  const tokenDiff = diffMaps(baseline.computed, uninstalled.computed)
  check('1/4 token snapshot diff is empty', tokenDiff.count === 0, tokenDiff.count + ' differ' + (tokenDiff.count === 0 ? '' : ' — ' + tokenDiff.sample))
  const inlineDiff = diffMaps(baseline.inline, uninstalled.inline)
  check('body inline declaration back to the official set', inlineDiff.count === 0, inlineDiff.count + ' differ' + (inlineDiff.count === 0 ? '' : ' — ' + inlineDiff.sample))
  check('2/4 no scope attribute on body', uninstalled.marked === false && uninstalled.accent === null && uninstalled.reduce === false, JSON.stringify({ marked: uninstalled.marked, accent: uninstalled.accent, reduce: uninstalled.reduce }))
  check('3/4 no style tag of ours remains', uninstalled.ourStyleTags === 0 && uninstalled.ourStyleTagsCss === 0, uninstalled.ourStyleTags + ' / ' + uninstalled.ourStyleTagsCss)
  check('the host stylesheet count is back to baseline', uninstalled.allStyleTags === baseline.allStyleTags && uninstalled.adopted === baseline.adopted, baseline.allStyleTags + ' -> ' + uninstalled.allStyleTags + ', adopted ' + baseline.adopted + ' -> ' + uninstalled.adopted)
  check('4/4 no node keeps a plugin marker', uninstalled.markedNodes === 0 && uninstalled.accentNodes === 0, JSON.stringify({ marked: uninstalled.markedNodes, accent: uninstalled.accentNodes }))
  check('no material variable left inline', uninstalled.goInline === 0, String(uninstalled.goInline))
  check('no scoped class left on body', uninstalled.bodyClasses.filter((name) => /_root$/.test(name)).length === 0, JSON.stringify(uninstalled.bodyClasses))
  if (typeof scopeClass === 'string') {
    const hash = scopeClass.replace(/_root$/, '')
    const leftovers = await session.evaluate('document.querySelectorAll(' + JSON.stringify('[class*="' + hash + '_"]') + ').length')
    check('no element anywhere carries a class from our stylesheets', leftovers === 0, hash + ': ' + leftovers + ' elements')
  }
  await session.shot(join(SHOTS, '02-uninstalled.png'))

  // --------------------------------------------------- the deliberate residue
  const stored = await session.evaluate('(function () { try { return localStorage.getItem(' + JSON.stringify(PREFERENCES_KEY) + ') } catch (error) { return null } })()')
  check('the saved accent survives on purpose', typeof stored === 'string' && stored.includes('dusk'), String(stored))

  // ------------------------------------------------------------- no listener
  await session.evaluate('window.dispatchEvent(new CustomEvent("dsh-go-theme:accent", { detail: "amber" }))')
  await session.evaluate('window.dispatchEvent(new CustomEvent("dsh-go-theme:reduce-material", { detail: true }))')
  await sleep(500)
  const afterEvents = await snapshot()
  check('the external events are inert once unmounted', afterEvents.accent === null && afterEvents.reduce === false && diffMaps(baseline.inline, afterEvents.inline).count === 0, JSON.stringify({ accent: afterEvents.accent, reduce: afterEvents.reduce }))

  // --------------------------------------------------------- second cycle
  await toggle(PATCH_ENABLED, MOUNTED, 'theme remounts')
  await sleep(1200)
  const remounted = await snapshot()
  check('a remount restores the saved accent', remounted.accent === 'dusk', String(remounted.accent))
  await toggle(PATCH_DISABLED, UNMOUNTED, 'theme unmounts again')
  await sleep(1200)
  const second = await snapshot()
  const secondDiff = diffMaps(baseline.inline, second.inline)
  const secondTokens = diffMaps(baseline.computed, second.computed)
  check('a second cycle lands on the same baseline', secondDiff.count === 0 && secondTokens.count === 0 && second.ourStyleTags === 0, secondDiff.count + ' inline / ' + secondTokens.count + ' tokens differ')

  check('no page exception during the audit', session.exceptions.length === 0, JSON.stringify(session.exceptions.slice(0, 2)))
} finally {
  session?.socket.close()
  for (const child of children) if (child.exitCode === null) child.kill('SIGKILL')
  await Promise.all(children.map((child) => new Promise((resolve) => (child.exitCode !== null ? resolve() : child.once('exit', resolve)))))
  await sleep(300)
  if (!KEEP) {
    for (const directory of [temporaryHome, chromeProfile]) {
      try {
        await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
      } catch (error) {
        console.log('info could not remove ' + directory + ': ' + error.code)
      }
    }
  }
}

console.log(failures.length === 0 ? 'ALL PASS (' + checks + ' checks)' : 'FAILURES: ' + failures.join(' | '))
process.exit(failures.length === 0 ? 0 : 1)
