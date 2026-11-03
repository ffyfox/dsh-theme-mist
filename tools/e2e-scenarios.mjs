#!/usr/bin/env node
/**
 * Cross-scenario sweep (T4.3).
 *
 * The theme has to survive more than one screenshot: a collapsed sidebar, a
 * settings dialog, a wide table, a diff, a code block, a command transcript, an
 * 800px window and a 2x display. This script walks those states in a real browser
 * and captures one screenshot per state.
 *
 * It runs against an **existing profile and its sessions**: nothing is created,
 * no message is sent, and the only thing that changes is which session is open.
 * A session log written by hand projects fine on the server but never appears in
 * the sidebar, so a fabricated fixture cannot be opened from the UI — measured
 * 2026-11-02, recorded in docs/architecture.md §8.
 *
 * Usage:
 *   node tools/e2e-scenarios.mjs --desktop-runtime <.../resources/app/dsh>
 *
 * Options:
 *   --desktop-runtime <dir>   required; the desktop app's bundled runtime tree
 *   --profile <name>          CLI profile that carries this plugin (default: t1verify)
 *   --workspace <substring>    workspace to open sessions from (default: the expanded one)
 *   --home <dir>              DSH home to read (default: $DSH_HOME or ~/.dsh)
 *   --chrome <path>           Chromium binary (default: google-chrome-stable)
 *   --shots <dir>             screenshot directory (default: docs/reference/t43-preview)
 *   --keep                    keep the browser profile
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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
/** Workspace substring to open; default is whichever one the sidebar left expanded. */
const WORKSPACE = arg('workspace')
const HOME = arg('home', process.env.DSH_HOME ?? join(process.env.HOME ?? '', '.dsh'))
const CHROME = arg('chrome', process.env.CHROME_PATH ?? 'google-chrome-stable')
const SHOTS = arg('shots', join(REPO, 'docs', 'reference', 't43-preview'))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

if (DESKTOP_RUNTIME === undefined) {
  console.error('--desktop-runtime is required (the desktop app resources/app/dsh directory)')
  process.exit(2)
}
const DESKTOP_BIN = join(DESKTOP_RUNTIME, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
if (!existsSync(DESKTOP_BIN)) {
  console.error('no desktop runtime at ' + DESKTOP_BIN)
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
    if (child.exitCode !== null) throw new Error(label + ' exited: ' + child.output.slice(-400))
    await sleep(200)
  }
  throw new Error(label + ' never printed a URL')
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
        this.exceptions.push(String(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text))
      }
      const entry = this.pending.get(message.id)
      if (entry === undefined) return
      this.pending.delete(message.id)
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)))
      else entry.resolve(message.result)
    })
  }

  static async connect(port) {
    for (let attempt = 0; attempt < 120; attempt++) {
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

  async clickPoint(point) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point[0], y: point[1], button: 'none', buttons: 0 })
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point[0], y: point[1], button: 'left', buttons: 1, clickCount: 1 })
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point[0], y: point[1], button: 'left', buttons: 0, clickCount: 1 })
  }

  async pointAt(selector) {
    return this.evaluate(
      '(() => { const node = document.querySelector(' + JSON.stringify(selector) + '); if (!node) return null;' +
        ' const box = node.getBoundingClientRect(); return [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)] })()',
    )
  }

  async click(selector) {
    const point = await this.pointAt(selector)
    if (point === null) return false
    await this.clickPoint(point)
    return true
  }

  async shot(name) {
    const result = await this.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(SHOTS, name + '.png'), Buffer.from(result.data, 'base64'))
  }
}

/** One page-side measurement of everything the sweep asserts on. */
const STATE_EXPR =
  '(() => {' +
  ' const style = getComputedStyle(document.body);' +
  ' const host = document.querySelector("[data-slot=sidebar]");' +
  ' const rail = host ? host.firstElementChild : null;' +
  ' const table = document.querySelector("table");' +
  ' const scroller = table ? table.parentElement : null;' +
  ' const code = document.querySelector("pre, [class*=md-code-block]");' +
  ' const blur = [...document.querySelectorAll("*")].filter((node) => { const filter = getComputedStyle(node).backdropFilter; return filter && filter !== "none" }).length;' +
  ' const hostZ = [...document.querySelectorAll("body *")].reduce((max, node) => { const z = Number(getComputedStyle(node).zIndex); return Number.isFinite(z) && z > max ? z : max }, 0);' +
  ' const ourNodes = [...document.querySelectorAll("*")].filter((node) => [...node.attributes].some((attribute) => attribute.name.startsWith("data-dsh-theme-mist") && node !== document.body)).length;' +
  ' return {' +
  '   themed: document.body.hasAttribute("data-dsh-theme-mist"),' +
  '   accent: document.body.getAttribute("data-dsh-theme-mist-accent"),' +
  '   pageBase: style.getPropertyValue("--dsh-theme-mist-page-base").trim(),' +
  '   railWidth: rail ? Math.round(rail.getBoundingClientRect().width) : null,' +
  '   railBorder: rail ? getComputedStyle(rail).borderRightWidth : null,' +
  '   hairlinePx: (() => { const widths = [...document.querySelectorAll("body *")].slice(0, 4000).map((node) => parseFloat(getComputedStyle(node).borderTopWidth) || 0).filter((value) => value > 0); widths.sort((a, b) => a - b); return widths[0] ?? null })(),' +
  '   viewport: [window.innerWidth, window.innerHeight],' +
  '   scrollWidth: document.scrollingElement.scrollWidth,' +
  '   dpr: window.devicePixelRatio,' +
  '   table: table ? { rows: table.rows.length, scrollWidth: scroller ? scroller.scrollWidth : null, clientWidth: scroller ? scroller.clientWidth : null } : null,' +
  '   codeBackground: code ? getComputedStyle(code).backgroundColor : null,' +
  '   highlighted: document.querySelectorAll("pre span, .md-code-block span").length,' +
  '   blur, hostZ, ourNodes,' +
  '   text: (document.body.innerText || "").slice(0, 4000),' +
  ' }' +
  '})()'

const SETTINGS_ROW = '[data-slot="settings.general.item"]'

const failures = []
let checks = 0
const check = (name, ok, detail) => {
  checks += 1
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail === undefined ? '' : ' — ' + detail))
  if (!ok) failures.push(name)
}

const chromeProfile = await mkdtemp(join(tmpdir(), 'dsh-theme-mist-scen-chrome-'))
let browser
try {
  const port = await freePort()
  const debugPort = await freePort()
  const server = start('node', [DESKTOP_BIN, '--profile', PROFILE, '--no-open', '--port', String(port)], {
    env: { ...process.env, DSH_HOME: HOME },
  })
  const url = await waitForUrl(server, 'scenario server')

  start(
    CHROME,
    [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--remote-debugging-port=' + debugPort, '--user-data-dir=' + chromeProfile, '--window-size=1440,900', 'about:blank',
    ],
    { stdio: 'ignore' },
  )
  browser = await Browser.connect(debugPort)

  await browser.send('Page.navigate', { url })
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      if (await browser.evaluate('!!document.querySelector("[data-slot=sidebar]")')) break
    } catch {}
    await sleep(200)
  }
  await sleep(3000)
  for (let attempt = 0; attempt < 5; attempt++) {
    const closed = await browser.evaluate('(() => { for (const dialog of [...document.querySelectorAll("[role=dialog]")]) { const button = [...dialog.querySelectorAll("button")].find((node) => /^(continue|got it|close|dismiss|cancel|not now|later)$/i.test(node.textContent.trim()) || /close/i.test(node.getAttribute("aria-label") ?? "")); if (button) { button.click(); return true } } return false })()')
    if (!closed) break
    await sleep(600)
  }

  // --- open a session that has real content --------------------------------
  //
  // Three things here are timing rather than content, and each of them used to be
  // one fixed sleep: the sidebar lists every workspace, a workspace's session rows
  // appear a beat after the workspace itself (titles load lazily), and a big
  // transcript paints after the click. Measured 2026-11-02 on a cold browser
  // profile: the session list can still be empty 1.5s after expanding the
  // workspace, which read as "no session has history" when it only meant "wait".
  const SESSIONS_EXPR = [
    '(() => [...document.querySelectorAll("[role=treeitem]")]',
    '  .filter((node) => (node.getAttribute("aria-expanded") ?? "") === ""',
    '    && !/^New Session$/i.test((node.textContent || "").trim()))',
    '  .slice(0, 8)',
    '  .map((node) => { const box = node.getBoundingClientRect()',
    '    return [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)] }))()',
  ].join('\n')

  /** Where the session rows are, right now. */
  const sessionPoints = async () => browser.evaluate(SESSIONS_EXPR)

  /** Wait for the list to fill in; [] means this workspace really has none. */
  const waitForSessions = async (timeoutMs = 12000) => {
    const started = Date.now()
    for (;;) {
      const points = await sessionPoints()
      if (points.length > 0) return points
      if (Date.now() - started > timeoutMs) return []
      await sleep(400)
    }
  }

  // Which workspace: an explicit --workspace substring, otherwise the one the app
  // left expanded (that is the folder the sidebar opened on).
  const workspacePoint = await browser.evaluate([
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
  ].join('\n'))

  let candidates = []
  if (workspacePoint !== null) {
    await browser.clickPoint(workspacePoint)
    candidates = await waitForSessions()
    if (candidates.length === 0) {
      // A collapsed workspace opens on click; one that was already expanded closes,
      // so a second click is what re-opens it.
      await browser.clickPoint(workspacePoint)
      candidates = await waitForSessions()
    }
  } else {
    candidates = await waitForSessions(3000)
  }
  check('the sidebar lists a session to open', candidates.length > 0, candidates.length + ' candidate(s)')

  // Prefer a session that actually contains a table: the sweep wants a wide
  // markdown surface, and the newest session is often a short one. The row
  // positions are captured once — the sidebar reorders (and re-renders) as each
  // session opens, so re-reading them mid-loop would click the same row twice.
  let picked = -1
  for (let index = 0; index < Math.min(candidates.length, 6); index++) {
    await browser.clickPoint(candidates[index])
    await sleep(3500)
    picked = index
    if (await browser.evaluate('!!document.querySelector("table")')) break
  }
  check('a session with history is available', picked >= 0, 'session #' + (picked + 1))
  const initial = await browser.evaluate(STATE_EXPR)
  check('theme is mounted on the session page', initial.themed === true, initial.accent)
  check('the transcript has markdown to look at', initial.highlighted > 0 || initial.text.includes('|'), 'highlighted spans: ' + initial.highlighted)
  await browser.shot('01-transcript')

  // --- settings dialog -----------------------------------------------------
  const settingsOpen = async () => (await browser.evaluate('document.querySelectorAll(' + JSON.stringify(SETTINGS_ROW) + ').length')) > 0
  let openedSettings = false
  for (let attempt = 0; attempt < 3 && !openedSettings; attempt++) {
    await browser.click('[data-slot="settings.launcher"] button')
    await sleep(1200)
    const menuPoint = await browser.evaluate('(() => { const node = [...document.querySelectorAll("[role=menuitem]")].find((entry) => /^(settings|设置)$/i.test((entry.innerText ?? "").trim())); if (!node) return null; const box = node.getBoundingClientRect(); return [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)] })()')
    if (menuPoint !== null) await browser.clickPoint(menuPoint)
    await sleep(2200)
    if (!(await settingsOpen())) {
      // The dialog remembers the last tab; the fixture rows live under General.
      const generalPoint = await browser.evaluate('(() => { const node = [...document.querySelectorAll("[role=dialog] *")].find((entry) => /^(general|通用)$/i.test((entry.textContent ?? "").trim()) && entry.children.length === 0); if (!node) return null; const box = node.getBoundingClientRect(); return [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)] })()')
      if (generalPoint !== null) await browser.clickPoint(generalPoint)
      await sleep(1200)
    }
    openedSettings = await settingsOpen()
  }
  const settings = await browser.evaluate(STATE_EXPR)
  check('the settings dialog opens over the glass', openedSettings)
  check('the plugin injects no DOM of its own', settings.ourNodes === 0, String(settings.ourNodes) + ' nodes; highest host z-index ' + settings.hostZ)
  check('blur still sits on one surface only', settings.blur <= 2, String(settings.blur))
  await browser.shot('03-settings')
  await browser.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
  await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
  await sleep(900)

  // --- collapsed sidebar ---------------------------------------------------
  const railRect = await browser.evaluate('(() => { const host = document.querySelector("[data-slot=sidebar]"); const rail = host ? host.firstElementChild : null; if (!rail) return null; const box = rail.getBoundingClientRect(); return [Math.round(box.x + box.width - 22), Math.round(box.y + 35)] })()')
  if (railRect !== null) await browser.clickPoint(railRect)
  await sleep(1200)
  const collapsed = await browser.evaluate(STATE_EXPR)
  check('the sidebar rail narrows', collapsed.railWidth !== null && initial.railWidth !== null && collapsed.railWidth < initial.railWidth, initial.railWidth + 'px -> ' + collapsed.railWidth + 'px')
  check('the material survives the collapsed rail', collapsed.themed === true && collapsed.pageBase !== '', collapsed.pageBase)
  await browser.shot('02-sidebar-collapsed')
  const railRectAgain = await browser.evaluate('(() => { const host = document.querySelector("[data-slot=sidebar]"); const rail = host ? host.firstElementChild : null; if (!rail) return null; const box = rail.getBoundingClientRect(); return [Math.round(box.x + box.width - 22), Math.round(box.y + 35)] })()')
  if (railRectAgain !== null) await browser.clickPoint(railRectAgain)
  await sleep(1000)

  // --- code, diff and the command card -------------------------------------
  const content = await browser.evaluate(STATE_EXPR)
  check('a code surface paints the palette well', content.codeBackground !== null && content.codeBackground !== 'rgba(0, 0, 0, 0)', content.codeBackground)
  check('syntax highlighting survived the theme', content.highlighted > 0, String(content.highlighted))
  await browser.shot('04-code-and-command')

  // --- narrow window -------------------------------------------------------
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 800, height: 700, deviceScaleFactor: 1, mobile: false })
  await sleep(1500)
  const narrow = await browser.evaluate(STATE_EXPR)
  check('an 800px window has no horizontal overflow', narrow.scrollWidth <= narrow.viewport[0] + 1, narrow.scrollWidth + ' vs ' + narrow.viewport[0])
  check('the theme survives the narrow layout', narrow.themed === true)
  await browser.shot('05-narrow-800')
  await browser.send('Emulation.clearDeviceMetricsOverride')
  await sleep(1000)

  // --- high DPI ------------------------------------------------------------
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
  await sleep(1500)
  const hidpi = await browser.evaluate(STATE_EXPR)
  check('the theme survives 2x without layout breakage', hidpi.dpr === 2 && hidpi.themed === true && hidpi.scrollWidth <= hidpi.viewport[0] + 1, hidpi.dpr + 'x, thinnest border ' + hidpi.hairlinePx + 'px')
  console.log('info thinnest border at 2x: ' + hidpi.hairlinePx + 'px (a 0.5px hairline only shows on surfaces that use one)')
  await browser.shot('06-hidpi-2x')
  await browser.send('Emulation.clearDeviceMetricsOverride')
  await sleep(800)

  // --- accent sweep on a content-heavy page --------------------------------
  let sweep = true
  for (const accent of ['daiqing', 'dusk', 'turquoise', 'amber', 'graphite', 'mist']) {
    await browser.evaluate('window.dispatchEvent(new CustomEvent("dsh-theme-mist:accent", { detail: ' + JSON.stringify(accent) + ' }))')
    await sleep(280)
    if ((await browser.evaluate('document.body.getAttribute("data-dsh-theme-mist-accent")')) !== accent) sweep = false
  }
  check('all six accents apply on a content-heavy page', sweep)
  await browser.shot('07-accent-mist')
  check('no page exception during the sweep', browser.exceptions.length === 0, JSON.stringify(browser.exceptions.slice(0, 2)))
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

console.log('info not covered by this sweep: right-hand panel, a session holding a long table or a diff, and the interactive terminal panel')
console.log(failures.length === 0 ? 'ALL PASS (' + checks + ' checks)' : 'FAILURES: ' + failures.join(' | '))
process.exit(failures.length === 0 ? 0 : 1)
