#!/usr/bin/env node
/**
 * Dual-version probe (T4.1): the same snapshot taken on two client shells, diffed.
 *
 * Both sides are started here, in isolation: the Web side runs the CLI against an
 * existing profile, the desktop side runs the desktop runtime's own `dsh` binary
 * against a throwaway `DSH_HOME` — never the real `desktop` profile, and never a
 * restart of the running app.
 *
 * What counts as a difference: colour tokens, layout rectangles, the composer
 * blur, the page gradient, our own body attributes and the accent sweep. Host
 * counters that legitimately differ between releases (settings row count, number
 * of plugin stylesheets) are reported but not diffed. Both sides are forced into
 * the same appearance before each snapshot, so a profile remembered as dark
 * cannot masquerade as a version difference.
 *
 * Usage:
 *   node tools/e2e-dual-version.mjs --desktop-runtime <.../resources/app/dsh>
 *
 * Options:
 *   --desktop-runtime <dir>   required; the desktop app's bundled runtime tree
 *   --web-profile <name>      CLI profile holding this plugin (default: t1verify)
 *   --dsh <path>              CLI binary (default: dsh from PATH)
 *   --chrome <path>           Chromium binary (default: google-chrome-stable)
 *   --shots <dir>             screenshot directory (default: docs/reference/t41-preview)
 *   --keep                    keep the temporary DSH_HOME and the browser profile
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
const DESKTOP_RUNTIME = arg('desktop-runtime')
const WEB_PROFILE = arg('web-profile', 't1verify')
const DSH = arg('dsh', 'dsh')
const CHROME = arg('chrome', process.env.CHROME_PATH ?? 'google-chrome-stable')
const SHOTS = arg('shots', join(REPO, 'docs', 'reference', 't41-preview'))
const HOME = process.env.DSH_HOME ?? join(process.env.HOME ?? '', '.dsh')
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
if (!existsSync(join(REPO, 'lib', 'client.js'))) {
  console.error('lib/client.js is missing — run pnpm build first')
  process.exit(2)
}
await mkdir(SHOTS, { recursive: true })

/** Free TCP port, asked of the kernel. */
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

/** Wait for the "dsh web: <url>" line both runtimes print once they listen. */
async function waitForUrl(child, label) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const match = child.output.match(/http:\/\/127\.0\.0\.1:(\d+)\/\?token=[\w-]+/)
    if (match !== null) return match[0]
    if (child.exitCode !== null) throw new Error(label + ' exited: ' + child.output.slice(-400))
    await sleep(200)
  }
  throw new Error(label + ' never printed a URL: ' + child.output.slice(-400))
}

/** Minimal CDP client: evaluate, navigate, screenshot, click. */
class Session {
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

  async mouseClick(point) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point[0], y: point[1], button: 'none', buttons: 0 })
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point[0], y: point[1], button: 'left', buttons: 1, clickCount: 1 })
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point[0], y: point[1], button: 'left', buttons: 0, clickCount: 1 })
  }

  async pointAt(selector) {
    const expression =
      '(() => { const node = document.querySelector(' + JSON.stringify(selector) + '); if (!node) return null;' +
      ' const box = node.getBoundingClientRect(); return [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)] })()'
    return this.evaluate(expression)
  }

  async shot(path) {
    const result = await this.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(path, Buffer.from(result.data, 'base64'))
  }
}

/** Tokens the theme touches; read off the built bundle so this stays in sync. */
const TOKENS = [
  ...new Set([...String(await readFile(join(REPO, 'lib', 'client.js'), 'utf8')).matchAll(/--dsw-[a-z0-9-]+/g)].map((match) => match[0])),
].sort()

const ROWS_SELECTOR = '[data-slot="settings.general.item"]'
const ROWS_EXPR = '[...document.querySelectorAll(' + JSON.stringify(ROWS_SELECTOR) + ')].flatMap((handle) => [...handle.children])'
const OUR_ROW_EXPR = '(' + ROWS_EXPR + ').find((entry) => (entry.textContent ?? "").includes("Graphite"))'

/**
 * Runs in the page. Kept as one self-contained function so the same code runs on
 * both shells; the class names the host generates are never read, only attribute
 * hooks, which is what makes the two sides comparable at all.
 */
function probeInPage(tokens) {
  const read = (name) => getComputedStyle(document.body).getPropertyValue(name).trim()
  const tokensOut = {}
  for (const token of tokens) tokensOut[token] = read(token)
  const rect = (selector) => {
    const node = document.querySelector(selector)
    if (!node) return null
    const box = node.getBoundingClientRect()
    return [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)]
  }
  const blur = []
  for (const node of document.querySelectorAll('*')) {
    const filter = getComputedStyle(node).backdropFilter
    if (filter && filter !== 'none') blur.push((node.getAttribute('data-slot') ?? node.tagName.toLowerCase()) + ' :: ' + filter)
  }
  const rows = __rows__
  return {
    safeMode: {
      tokens: tokensOut,
      ownAttrs: [...document.body.attributes]
        .filter((attribute) => attribute.name.startsWith('data-dsh-go'))
        .map((attribute) => attribute.name + '=' + attribute.value)
        .sort(),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      backgroundImage: getComputedStyle(document.body).backgroundImage,
      layout: {
        seat: rect('[data-composer-seat][data-conversation-region="composer"]'),
        card: rect('[data-composer-card]'),
        viewport: [window.innerWidth, window.innerHeight],
      },
      blur,
    },
    host: {
      themed: document.body.hasAttribute('data-dsh-go-theme'),
      accent: document.body.getAttribute('data-dsh-go-accent'),
      ourStyles: [...document.querySelectorAll('style[data-plugin]')].filter((tag) => (tag.getAttribute('data-plugin') ?? '').includes('theme-go')).length,
      styleTags: document.querySelectorAll('style[data-plugin]').length,
      rows: rows.length,
      hasAccentRow: rows.some((row) => (row.textContent ?? '').includes('Graphite')),
      hasSwitchRow: rows.some((row) => row.querySelector('[role=switch]') !== null),
      radios: rows.reduce((total, row) => total + row.querySelectorAll('[role=radio]').length, 0),
    },
  }
}

const TRIGGER = '[data-slot="settings.trigger"]'
const LAUNCHER = '[data-slot="settings.launcher"] button'
const CLOSE = '[data-slot="settings.close"]'
const PROBE = '(' + String(probeInPage).replace('__rows__', ROWS_EXPR) + ')(' + JSON.stringify(TOKENS) + ')'

const rowCount = (session) => session.evaluate('document.querySelectorAll(' + JSON.stringify(ROWS_SELECTOR) + ').length')
const colorScheme = (session) => session.evaluate('getComputedStyle(document.documentElement).colorScheme')

/** Close first-run dialogs (preview notice, sign-in) so the panel is reachable. */
async function dismissFirstRun(session) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const closed = await session.evaluate(
      '(() => { for (const dialog of [...document.querySelectorAll("[role=dialog]")]) {' +
        ' if (/Accent|Reduce transparency/.test(dialog.innerText ?? "")) continue;' +
        ' const button = [...dialog.querySelectorAll("button")].find((node) => /^(continue|got it|close|dismiss|cancel|not now|later)$/i.test(node.textContent.trim()) || /(close|dismiss)/i.test(node.getAttribute("aria-label") ?? ""));' +
        ' if (button) { button.click(); return true } } return false })()',
    )
    if (!closed) break
    await sleep(700)
  }
}

/**
 * Open the settings panel and wait for our rows. 0.2.1 renders an inline
 * settings.trigger; 0.2.2 only reaches it through the account menu, so the
 * trigger path is tried first and the menu path second.
 */
async function openPanel(session) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const usedTrigger = await session.evaluate(
      '(() => { const node = document.querySelector(' + JSON.stringify(TRIGGER) + '); if (!node) return false; (node.querySelector("button") ?? node).click(); return true })()',
    )
    if (!usedTrigger) {
      await session.mouseClick(await session.pointAt(LAUNCHER))
      await sleep(900)
      const item = await session.evaluate(
        '(() => { const node = [...document.querySelectorAll("[role=menuitem]")].find((entry) => /^(settings|设置)$/i.test((entry.innerText ?? "").trim()));' +
          ' if (!node) return null; const box = node.getBoundingClientRect();' +
          ' return [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)] })()',
      )
      if (item !== null) await session.mouseClick(item)
    }
    for (let wait = 0; wait < 25; wait++) {
      await sleep(200)
      if ((await rowCount(session)) > 0) return true
    }
    await dismissFirstRun(session)
  }
  return false
}

/** Close the settings panel and confirm it is gone. */
async function closePanel(session) {
  const closed = await session.evaluate(
    '(() => { const node = document.querySelector(' + JSON.stringify(CLOSE) + '); if (node) { (node.querySelector("button") ?? node).click(); return true }' +
      ' const button = [...document.querySelectorAll("[role=dialog] button")].find((entry) => /close/i.test(entry.getAttribute("aria-label") ?? ""));' +
      ' if (button) { button.click(); return true } return false })()',
  )
  if (!closed) {
    await session.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
    await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
  }
  for (let wait = 0; wait < 25; wait++) {
    await sleep(200)
    if ((await rowCount(session)) === 0) return true
  }
  return false
}

/** Click one of Light / Dark / System in the Appearance row. */
const pickAppearance = (session, label) =>
  session.evaluate(
    '(() => { const row = (' + ROWS_EXPR + ').find((entry) => /LightDarkSystem/.test((entry.textContent ?? "").replace(/\\s+/g, "")) && !/Graphite/.test(entry.textContent ?? ""));' +
      ' if (!row) return false; const button = [...row.querySelectorAll("button")].find((node) => node.textContent.trim() === ' + JSON.stringify(label) + ');' +
      ' if (!button) return false; button.click(); return true })()',
  )

/** Click one of the six accent swatches in our own row. */
const pickAccent = (session, name) =>
  session.evaluate(
    '(() => { const row = ' + OUR_ROW_EXPR + ';' +
      ' const button = [...(row?.querySelectorAll("[role=radio]") ?? [])].find((node) => node.textContent.trim() === ' + JSON.stringify(name) + ');' +
      ' if (!button) return false; button.click(); return true })()',
  )

/**
 * Snapshot one side: light, settings panel, six accents, dark — with the
 * appearance forced on both sides so the colour tokens are comparable.
 */
async function snapshotSide(session, url, label, shotsPrefix) {
  session.exceptions.length = 0
  await session.send('Page.navigate', { url })
  let themed = false
  for (let attempt = 0; attempt < 400; attempt++) {
    try {
      if (await session.evaluate('document.body && document.body.hasAttribute("data-dsh-go-theme")')) {
        themed = true
        break
      }
    } catch {}
    await sleep(200)
  }
  await sleep(2500)
  await dismissFirstRun(session)
  await sleep(600)

  // Force light: the profile may remember dark, and that is not a version fact.
  const restoredScheme = await colorScheme(session)
  const panelOpened = await openPanel(session)
  if (panelOpened) {
    await pickAppearance(session, 'Light')
    await sleep(900)
    await closePanel(session)
  }
  await sleep(600)
  const light = await session.evaluate(PROBE)
  await session.shot(shotsPrefix + '-light.png')

  await openPanel(session)
  await sleep(500)
  const panel = await session.evaluate(PROBE)
  await session.shot(shotsPrefix + '-panel.png')

  const accentSweep = {}
  for (const name of ['Mist', 'Daiqing', 'Dusk', 'Turquoise', 'Amber', 'Graphite']) {
    const clicked = await pickAccent(session, name)
    await sleep(420)
    accentSweep[name] = {
      clicked,
      brand: await session.evaluate('getComputedStyle(document.body).getPropertyValue("--dsw-alias-brand-primary").trim()'),
      pageBase: await session.evaluate('getComputedStyle(document.body).getPropertyValue("--dsh-go-page-base").trim()'),
      accent: await session.evaluate('document.body.getAttribute("data-dsh-go-accent")'),
    }
  }
  await pickAccent(session, 'Mist')
  await sleep(350)

  const darkSwitched = await pickAppearance(session, 'Dark')
  await sleep(1200)
  await closePanel(session)
  await sleep(700)
  const darkState = await session.evaluate(PROBE)
  await session.shot(shotsPrefix + '-dark.png')

  // Leave the profile as we found it.
  if (restoredScheme !== 'dark') {
    await openPanel(session)
    await pickAppearance(session, 'Light')
    await sleep(800)
    await closePanel(session)
  }

  return { label, themed, panelOpened, darkSwitched, light, panel, darkState, accentSweep, exceptions: [...session.exceptions] }
}

/* --- run --------------------------------------------------------------- */

const temporaryHome = await mkdtemp(join(tmpdir(), 'dsh-go-dual-'))
const chromeProfile = await mkdtemp(join(tmpdir(), 'dsh-go-dual-chrome-'))
const debugPort = await freePort()

const failures = []
let checks = 0
const check = (name, ok, detail) => {
  checks += 1
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail === undefined ? '' : ' — ' + detail))
  if (!ok) failures.push(name)
}

let session
try {
  const webPort = await freePort()
  const webServer = start(DSH, ['--profile', WEB_PROFILE, '--no-open', '--port', String(webPort)], {
    env: { ...process.env, DSH_HOME: HOME },
  })
  const webUrl = await waitForUrl(webServer, 'web side')

  const desktopPort = await freePort()
  const profileDir = join(temporaryHome, 'profiles', 'dtverify')
  await mkdir(join(profileDir, 'node_modules', '@dsh-external'), { recursive: true })
  await writeFile(
    join(profileDir, 'package.json'),
    JSON.stringify(
      {
        name: 'dtverify-profile',
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
  const desktopServer = start('node', [DESKTOP_BIN, '--profile', 'dtverify', '--no-open', '--port', String(desktopPort)], {
    env: { ...process.env, DSH_HOME: temporaryHome },
  })
  const desktopUrl = await waitForUrl(desktopServer, 'desktop side')

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

  const web = await snapshotSide(session, webUrl, 'web (CLI)', join(SHOTS, 'dual-web'))
  const desktop = await snapshotSide(session, desktopUrl, 'desktop runtime', join(SHOTS, 'dual-desktop'))

  for (const side of [web, desktop]) {
    check(side.label + ': the theme mounted', side.themed === true)
    check(side.label + ': three plugin stylesheets', side.light.host.ourStyles === 3, side.light.host.ourStyles + ' of ' + side.light.host.styleTags)
    check(side.label + ': settings panel opened', side.panelOpened === true)
    check(side.label + ': settings row rendered', side.panel.host.hasAccentRow && side.panel.host.radios === 6, 'rows=' + side.panel.host.rows + ' radios=' + side.panel.host.radios)
    check(side.label + ': reduce-transparency switch rendered', side.panel.host.hasSwitchRow === true)
    check(side.label + ': dark mode reached', side.darkSwitched === true && side.darkState.safeMode.colorScheme === 'dark', side.darkState.safeMode.colorScheme)
    check(side.label + ': no page exception', side.exceptions.length === 0, JSON.stringify(side.exceptions))
  }

  const differences = []
  for (const mode of ['light', 'panel', 'darkState']) {
    for (const [name, value] of Object.entries(web[mode].safeMode)) {
      const other = desktop[mode].safeMode[name]
      if (JSON.stringify(value) !== JSON.stringify(other)) {
        differences.push(mode + '.' + name + ': ' + JSON.stringify(value) + ' vs ' + JSON.stringify(other))
      }
    }
  }
  for (const name of Object.keys(web.accentSweep)) {
    const left = web.accentSweep[name]
    const right = desktop.accentSweep[name]
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      differences.push('accent.' + name + ': ' + JSON.stringify(left) + ' vs ' + JSON.stringify(right))
    }
  }
  check('both shells render the same theme surface', differences.length === 0, differences.slice(0, 4).join(' | '))

  console.log(
    'info host counters: plugin stylesheets ' +
      web.light.host.styleTags +
      ' vs ' +
      desktop.light.host.styleTags +
      ', settings rows ' +
      web.panel.host.rows +
      ' vs ' +
      desktop.panel.host.rows,
  )
  console.log('info screenshots: ' + join(SHOTS, 'dual-web-*.png') + ' / ' + join(SHOTS, 'dual-desktop-*.png'))
} finally {
  session?.socket.close()
  for (const child of children) if (child.exitCode === null) child.kill('SIGKILL')
  await Promise.all(
    children.map(
      (child) => new Promise((resolve) => (child.exitCode !== null ? resolve() : child.once('exit', resolve))),
    ),
  )
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
