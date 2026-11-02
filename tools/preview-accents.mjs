#!/usr/bin/env node
/**
 * Accent previews for the README (T5.3).
 *
 * Six accents, six screenshots, one command — so the images in README.md are a
 * reproducible artifact rather than something someone once pasted in. The script
 * drives a real instance, opens a session that already has content (a preview of
 * an empty conversation says nothing about the palette), switches the accent
 * through the same CustomEvent the settings row uses, and captures one frame per
 * accent.
 *
 * It also doubles as the README's install check: point --home/--profile at a
 * throwaway DSH_HOME and the run fails loudly if the freshly installed plugin did
 * not mount.
 *
 * Usage:
 *   node tools/preview-accents.mjs
 *   node tools/preview-accents.mjs --home /tmp/accept --profile goweb --shots /tmp/x
 *
 * Options:
 *   --desktop-runtime <dir>  desktop app's bundled runtime (default: the CLI on PATH)
 *   --profile <name>         profile to boot (default: t1verify)
 *   --home <dir>             DSH home to read (default: $DSH_HOME or ~/.dsh)
 *   --workspace <substring>  workspace to open sessions from (default: the expanded one)
 *   --shots <dir>            screenshot directory (default: docs/images/accents)
 *   --width/--height <n>     viewport in CSS pixels (default: 1280 / 800)
 *   --appearance <light|dark|current>  force an appearance through --patch (default: light)
 *   --dialog                 open Settings → General before shooting (shows the accent row)
 *   --language <zh|en>       force the interface language through --patch
 *   --chrome <path>          Chromium binary (default: google-chrome-stable)
 *   --keep                   keep the browser profile
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
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
const DESKTOP_RUNTIME = arg('desktop-runtime')
const PROFILE = arg('profile', 't1verify')
const HOME = arg('home', process.env.DSH_HOME ?? join(process.env.HOME ?? '', '.dsh'))
const WORKSPACE = arg('workspace')
const SHOTS = arg('shots', join(REPO, 'docs', 'images', 'accents'))
const CHROME = arg('chrome', process.env.CHROME_PATH ?? 'google-chrome-stable')
const WIDTH = Number(arg('width', '1280'))
const HEIGHT = Number(arg('height', '800'))
/**
 * Which appearance to photograph. A profile that remembers dark would otherwise
 * produce six dark previews on a machine whose owner reads the README in light
 * mode; the flag pins it so the images are comparable across runs.
 */
const APPEARANCE = arg('appearance', 'light')
/** Open the settings dialog, so the shot shows the row the reader is meant to click. */
const WITH_DIALOG = argv.includes('--dialog')
/** Interface language for the shot (zh / en). Unset keeps whatever the profile uses. */
const LANGUAGE = arg('language')

/** Order matches the settings row, so the table in README reads the same way. */
const ACCENTS = ['mist', 'daiqing', 'dusk', 'turquoise', 'amber', 'graphite']

/** Package name, read from the manifest so a rename never needs a sweep here. */
const PKG = JSON.parse(await readFile(join(REPO, 'package.json'), 'utf8')).name

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

if (DESKTOP_RUNTIME !== undefined && !existsSync(join(DESKTOP_RUNTIME, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'))) {
  console.error('no desktop runtime at ' + DESKTOP_RUNTIME)
  process.exit(2)
}
if (!existsSync(join(REPO, 'lib', 'client.js'))) {
  console.error('lib/client.js is missing — run pnpm build first')
  process.exit(2)
}
await mkdir(SHOTS, { recursive: true })

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

async function waitForUrl(child, label) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const match = child.output.match(/http:\/\/127\.0\.0\.1:(\d+)\/\?token=[\w-]+/)
    if (match !== null) return match[0]
    if (child.exitCode !== null) throw new Error(label + ' exited: ' + child.output.slice(-500))
    await sleep(200)
  }
  throw new Error(label + ' never printed a URL: ' + child.output.slice(-500))
}

class Browser {
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
          const browser = new Browser(socket)
          await browser.send('Page.enable')
          await browser.send('Runtime.enable')
          return browser
        }
      } catch {}
      await sleep(150)
    }
    throw new Error('no DevTools page target')
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

  async clickPoint(point) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point[0], y: point[1], button: 'none', buttons: 0 })
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point[0], y: point[1], button: 'left', buttons: 1, clickCount: 1 })
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point[0], y: point[1], button: 'left', buttons: 0, clickCount: 1 })
  }

  async shot(path) {
    const result = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await writeFile(path, Buffer.from(result.data, 'base64'))
  }
}

const failures = []
let checks = 0
const check = (name, ok, detail) => {
  checks += 1
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail === undefined ? '' : ' — ' + detail))
  if (!ok) failures.push(name)
}

/* --------------------------------------------------------------- session pick */
/** Rows the sidebar is showing that are sessions (not workspaces, not "New Session"). */
const SESSION_ROWS = [
  '(() => [...document.querySelectorAll("[role=treeitem]")]',
  '  .filter((node) => (node.getAttribute("aria-expanded") ?? "") === "")',
  '  .slice(1, 9)',
  '  .map((node) => { const box = node.getBoundingClientRect()',
  '    return [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)] }))()',
].join('\n')

const WORKSPACE_POINT = [
  '(() => {',
  '  const items = [...document.querySelectorAll("[role=treeitem]")]',
  '  const wanted = ' + JSON.stringify(WORKSPACE ?? null),
  '  const expanded = (entry) => (entry.getAttribute("aria-expanded") ?? "") !== ""',
  '  const node = wanted === null',
  '    ? items.find(expanded)',
  '    : (items.find((entry) => expanded(entry) && (entry.textContent ?? "").includes(wanted))',
  '       ?? items.find((entry) => (entry.textContent ?? "").includes(wanted)))',
  '  if (!node) return null',
  '  const box = node.getBoundingClientRect()',
  '  return [Math.round(box.x + 10), Math.round(box.y + box.height / 2)]',
  '})()',
].join('\n')

const chromeProfile = await mkdtemp(join(tmpdir(), 'dsh-go-preview-chrome-'))
let browser
try {
  const bin = DESKTOP_RUNTIME === undefined
    ? ['dsh', []]
    : ['node', [join(DESKTOP_RUNTIME, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')]]
  // Appearance and language ride the launcher's own patch overlay: writing them to
  // the profile would edit someone else's configuration to take a screenshot.
  // One file, so a single --patch carries both overrides.
  const patchLines = []
  if (APPEARANCE === 'light' || APPEARANCE === 'dark') {
    patchLines.push('# preview-accents: pin the appearance so the six shots are comparable.')
    patchLines.push('- id: ui-theme', '  config:', '    preference: ' + APPEARANCE)
  }
  if (LANGUAGE !== undefined) {
    patchLines.push('', '# preview-accents: same for the interface language.')
    patchLines.push('- id: locale', '  config:', '    preference: ' + LANGUAGE)
  }
  const overlays = []
  if (patchLines.length > 0) {
    const overlay = join(await mkdtemp(join(tmpdir(), 'dsh-go-preview-patch-')), 'preview.yml')
    await writeFile(overlay, patchLines.join('\n') + '\n')
    overlays.push('--patch', overlay)
  }

  const port = await freePort()
  // Launcher flags must precede the app's own flags: the parser hands everything
  // from the first app argument (--no-open) onward to the app, which rejects --patch.
  const server = start(bin[0], [...bin[1], '--profile', PROFILE, ...overlays, '--no-open', '--port', String(port)], {
    env: { ...process.env, DSH_HOME: HOME },
  })
  const url = await waitForUrl(server, 'preview server')

  const debugPort = await freePort()
  start(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + debugPort, '--user-data-dir=' + chromeProfile,
    '--window-size=' + WIDTH + ',' + HEIGHT, 'about:blank',
  ])
  browser = await Browser.connect(debugPort)
  // Pin the viewport: --window-size is a hint, and a headless window that reports
  // 800x600 would silently produce previews of a different layout.
  await browser.send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false,
  })

  await browser.send('Page.navigate', { url })
  await browser.waitFor('!!document.querySelector("[data-slot=sidebar]")', 60000, 'client shell')
  await sleep(2500)
  /**
   * A fresh profile opens with first-run modals ("Add an API key…", "Configure
   * later"). They cover the centre of the page and swallow clicks, so the preview
   * has to dismiss them before it can photograph anything — and again just before
   * opening Settings, because a slow modal can appear after the first pass.
   */
  const dismissModals = async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const closed = await browser.evaluate('(() => { for (const dialog of [...document.querySelectorAll("[role=dialog]")]) { const button = [...dialog.querySelectorAll("button")].find((node) => { const text = (node.textContent || "").trim(); return /(continue|got it|close|dismiss|cancel|not now|later|skip)$/i.test(text) || /稍后|以后|跳过|关闭|取消/.test(text) || /close/i.test(node.getAttribute("aria-label") ?? "") }); if (button) { button.click(); return true } } return false })()')
      if (!closed) return
      await sleep(600)
    }
  }
  await dismissModals()

  check('the plugin mounted', await browser.evaluate('document.body.hasAttribute("data-dsh-go-theme")'))
  check('three stylesheets are injected',
    (await browser.evaluate('[...document.querySelectorAll("style[data-plugin-css]")].filter((node) => node.dataset.pluginCss.includes(' + JSON.stringify(PKG) + ')).length')) === 3)

  // --- open a session with content ------------------------------------------
  // The welcome screen is ~650 characters of boilerplate, so "the body has text"
  // proves nothing. A preview is only worth publishing when the transcript shows
  // real markdown: a code block, a table, or at least a heading and a paragraph.
  const CONTENT_EXPR = '(() => { const node = document.querySelector(".md-code-block, table, pre, [class*=md-]");'
    + ' return { rich: node !== null, chars: (document.body.innerText || "").length } })()'
  const workspacePoint = await browser.evaluate(WORKSPACE_POINT)
  let sessionPoints = []
  if (workspacePoint !== null) {
    await browser.clickPoint(workspacePoint)
    for (let attempt = 0; attempt < 30; attempt++) {
      sessionPoints = await browser.evaluate(SESSION_ROWS)
      if (sessionPoints.length > 0) break
      await sleep(400)
      if (attempt === 15) await browser.clickPoint(workspacePoint)
    }
  }
  // A profile with no history is a legitimate subject: it is what a reader sees
  // right after installing, and it keeps somebody else's conversation out of a
  // published screenshot. Only complain when there *were* sessions and none of them
  // rendered markdown, because that would mean the picker is broken.
  let content = null
  if (sessionPoints.length === 0) {
    console.log('info this profile has no sessions — shooting the empty state')
  } else {
    let opening = null
    for (let index = 0; index < Math.min(sessionPoints.length, 6); index++) {
      await browser.clickPoint(sessionPoints[index])
      await sleep(3500)
      if ((await browser.evaluate(CONTENT_EXPR)).rich) {
        opening = index
        break
      }
    }
    content = await browser.evaluate(CONTENT_EXPR)
    check('the opened session renders markdown', content.rich,
      opening === null ? 'no candidate had markdown' : 'session #' + (opening + 1) + ', ' + content.chars + ' chars')
  }

  // --- the accent row, when asked for ---------------------------------------
  /** Click a point, or quietly do nothing when the element was not there. */
  const clickPointOrSkip = async (point) => {
    if (point !== null) await browser.clickPoint(point)
  }
  if (WITH_DIALOG) {
    await dismissModals()
    const rows = () => browser.evaluate('document.querySelectorAll(\'[data-slot="settings.general.item"]\').length')
    /** Centre of the first match, or null. Keeps the click plumbing in one place. */
    const centreOf = (expression) => browser.evaluate('(() => { const node = ' + expression + '; if (!node) return null; const box = node.getBoundingClientRect(); return [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)] })()')
    // Two shells, two entry points: 0.2.1 opens the dialog from a sidebar trigger,
    // 0.2.2 goes through the account menu. Try the direct one, then the menu item.
    await clickPointOrSkip(await centreOf('document.querySelector(\'[data-slot="settings.launcher"] button, [data-slot="settings.trigger"] button\')'))
    await sleep(1500)
    await clickPointOrSkip(await centreOf('[...document.querySelectorAll("[role=menuitem]")].find((entry) => /^(settings|设置)$/i.test((entry.innerText ?? "").trim()))'))
    await sleep(1500)
    // The dialog remembers the last tab, and our rows live under General.
    for (let attempt = 0; attempt < 3 && (await rows()) === 0; attempt++) {
      const general = await centreOf('[...document.querySelectorAll("[role=dialog] *")].find((entry) => /^(general|通用|常规|一般)$/i.test((entry.textContent ?? "").trim()) && entry.getBoundingClientRect().width < 240)')
      if (general === null) break
      await browser.clickPoint(general)
      await sleep(1500)
    }
    if ((await rows()) === 0) {
      console.log('info could not reach Settings → General on this shell; shooting the page as it is')
    } else {
      const swatches = await browser.evaluate('document.querySelectorAll("[id^=dsh-go-accent-]").length')
      check('the settings dialog shows the accent row', true)
      check('six swatches are rendered', swatches === 6, String(swatches))
    }
  }

  // --- six accents -----------------------------------------------------------
  const sizes = []
  for (const accent of ACCENTS) {
    await browser.evaluate('window.dispatchEvent(new CustomEvent("dsh-go-theme:accent", { detail: ' + JSON.stringify(accent) + ' }))')
    await sleep(600)
    const applied = await browser.evaluate('document.body.getAttribute("data-dsh-go-accent")')
    check(accent + ': applied', applied === accent, String(applied))
    // Park the pointer: the last click left a hover card over the transcript.
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2, button: 'none', buttons: 0 })
    await sleep(250)
    const path = join(SHOTS, accent + '.png')
    await browser.shot(path)
    sizes.push(accent + ' ' + Math.round((await stat(path)).size / 1024) + ' KB')
  }
  console.log('info ' + sizes.join(', '))
  check('no page exception', browser.exceptions.length === 0, JSON.stringify(browser.exceptions.slice(0, 2)))
  console.log('info shots written to ' + SHOTS)
} finally {
  browser?.socket.close()
  for (const child of children) if (child.exitCode === null) child.kill('SIGKILL')
  await Promise.all(children.map((child) => new Promise((resolve) => (child.exitCode !== null ? resolve() : child.once('exit', resolve)))))
  await sleep(300)
  if (!KEEP) {
    try {
      await rm(chromeProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
    } catch (error) {
      console.log('info could not remove ' + chromeProfile + ': ' + error.code)
    }
  }
}

console.log(failures.length === 0 ? 'ALL PASS (' + checks + ' checks)' : 'FAILURES: ' + failures.join(' | '))
process.exit(failures.length === 0 ? 0 : 1)
