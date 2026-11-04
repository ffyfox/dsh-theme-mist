#!/usr/bin/env node
/**
 * README album (T5.14).
 *
 * The pictures in README.md are a reproducible artifact, not something someone
 * once pasted in: one command boots a throwaway instance, seeds a demo
 * conversation, and writes every image the README shows.
 *
 * Why a second tool next to preview-accents.mjs: that one answers "does this
 * palette look right" with one full-window shot per accent on an empty page.
 * The README needs something else — a page with a real user bubble, a code
 * block and a table, so the surfaces a reader will actually meet are in frame,
 * plus the light/dark pair composed into a single image. Same browser plumbing,
 * different subject.
 *
 * The demo conversation is *ours*: a local OpenAI-compatible stub answers with
 * a fixed markdown reply, and the script types the question through the real
 * composer. Nothing from the host's own history is involved — the throwaway
 * `DSH_HOME` never sees a real workspace or account.
 *
 * Every image is composed at 2x and written as WebP: at 2560x1600 a screenshot
 * of this page is ~868 KB as PNG and ~105 KB at quality 88, and the hairline
 * borders stay sharp when the README shows it at 400-800 CSS pixels wide.
 *
 * Usage:
 *   node tools/preview-album.mjs --desktop-runtime <dsh dir> [--out docs/images]
 *
 * Output (all WebP):
 *   accents/<accent>.webp        light (top-left) + dark (bottom-right), split
 *   hero-light.webp              the light frame on its own
 *   hero-dark.webp               the dark frame on its own
 *   settings.webp                Settings -> General with both theme rows
 *   sidebar-sheet.webp           sidebar column, glass material
 *   sidebar-flat.webp            sidebar column, flat material
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = dirname(dirname(fileURLToPath(import.meta.url)))
const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const index = argv.indexOf('--' + name)
  return index >= 0 ? argv[index + 1] : fallback
}
const DESKTOP_RUNTIME = arg('desktop-runtime')
const OUT = arg('out', join(REPO, 'docs', 'images'))
const CHROME = arg('chrome', process.env.CHROME_PATH ?? 'google-chrome-stable')
const WIDTH = 1280
const HEIGHT = 800
const DPR = 2
/**
 * The sidebar column, cropped to the part that differs. The full 800px column is
 * two thirds empty page, and at README width that reads as a pair of blank
 * columns; 480px keeps the logo, the nav rows, the workspace and the session.
 */
const SIDEBAR_CROP = 480
/** How much of the content area the sidebar crop keeps, to show the panel edge. */
const SIDEBAR_EDGE = 140

/** Order matches the settings row, so the wall reads the same way. */
const ACCENTS = ['mist', 'daiqing', 'dusk', 'turquoise', 'amber', 'graphite']

/** The question the demo turn asks. Short enough to stay on one bubble line. */
const DEMO_PROMPT = '解释一下 OKLCH，并给一段 TypeScript 转换函数和一张传统色对照表'

/**
 * The stub's answer. It has to carry the three surfaces the README is about: a
 * paragraph (text ramp), a fenced block (code well) and a pipe table (row
 * hairlines) — and end with a line that the transcript's own scroll position
 * leaves half under the composer, so the frosted band is visible doing work.
 */
const DEMO_REPLY = [
  'OKLCH 把颜色拆成感知均匀的三个轴，正好适合给传统色做数值化归档：L 是明度，C 是彩度，H 是色相。',
  '',
  '```ts',
  "import { Color } from 'culori'",
  '',
  'export const toHex = (l: number, c: number, h: number) =>',
  "  new Color('oklch', [l, c, h]).to('srgb').toString({ format: 'hex' })",
  '',
  'toHex(0.86, 0.04, 250) // 雾蓝的浅色档',
  '```',
  '',
  '| 传统色 | L | C | H |',
  '| --- | --- | --- | --- |',
  '| 雾蓝 | 0.86 | 0.04 | 250 |',
  '| 黛青 | 0.55 | 0.06 | 210 |',
  '| 暮紫 | 0.48 | 0.09 | 300 |',
  '',
  '三个轴里 L 最该先定：它决定文字压在上面还读不读得动；C 和 H 只影响气质，可以后调。',
].join('\n')

/**
 * The split. Both corners are measured on the frame, not guessed: 0.80 keeps the
 * sidebar's bottom fifth in the dark half, 0.27 clears the accent glow, the user
 * bubble and the turn timestamp, so each half shows something whole. The seam
 * still crosses the code block and the table — that is the point of the image,
 * and the divider is what stops it reading as a mistake (see composite()).
 */
const SPLIT_LEFT_Y = 0.80
const SPLIT_RIGHT_Y = 0.27

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

if (DESKTOP_RUNTIME === undefined) {
  console.error('--desktop-runtime is required (the desktop app resources/app/dsh directory)')
  process.exit(2)
}
const BIN = join(DESKTOP_RUNTIME, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
if (!existsSync(BIN)) {
  console.error('no dsh runtime at ' + DESKTOP_RUNTIME)
  process.exit(2)
}
if (!existsSync(join(REPO, 'lib', 'client.js'))) {
  console.error('lib/client.js is missing — run pnpm build first')
  process.exit(2)
}

const failures = []
let checks = 0
const check = (name, ok, detail) => {
  checks += 1
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail === undefined ? '' : ' — ' + detail))
  if (!ok) failures.push(name)
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = createNetServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })

/* ------------------------------------------------------------------ stub LLM */
/**
 * A local provider that answers with DEMO_REPLY. The composer path, the stream
 * and the renderer are all the host's; only the words are ours.
 */
async function startStub() {
  const port = await freePort()
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      const payload = (() => {
        try {
          return JSON.parse(body)
        } catch {
          return {}
        }
      })()
      const model = payload.model ?? 'stub'
      const chunk = (delta, finish = null) =>
        JSON.stringify({
          id: 'chatcmpl-preview', object: 'chat.completion.chunk', created: 0, model,
          choices: [{ index: 0, delta, finish_reason: finish }],
        })
      if (payload.stream === true) {
        response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
        response.write('data: ' + chunk({ role: 'assistant' }) + '\n\n')
        for (const piece of DEMO_REPLY.match(/[\s\S]{1,24}/g) ?? []) response.write('data: ' + chunk({ content: piece }) + '\n\n')
        response.write('data: ' + chunk({}, 'stop') + '\n\n')
        response.write('data: [DONE]\n\n')
        response.end()
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        id: 'chatcmpl-preview', object: 'chat.completion', created: 0, model,
        choices: [{ index: 0, message: { role: 'assistant', content: DEMO_REPLY }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 120, total_tokens: 130 },
      }))
    })
  })
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
  return { port, server }
}

/* ---------------------------------------------------------------- CDP client */
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

  async shotBuffer() {
    const result = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    return Buffer.from(result.data, 'base64')
  }

  async click(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 })
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 })
  }
}

/* --------------------------------------------------------------- page helpers */
/** Centre of the first element matching a selector, or null. */
const centre = (browser, selector) =>
  browser.evaluate(
    '(() => { const node = document.querySelector(' + JSON.stringify(selector) + ');' +
      ' if (!node) return null; const box = node.getBoundingClientRect();' +
      ' return [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)] })()',
  )

/** Sidebar rows as {text, x, y}; the tree is the only place sessions are listed. */
const TREE_ROWS = '(() => [...document.querySelectorAll("[role=treeitem]")].map((node) => {' +
  ' const box = node.getBoundingClientRect();' +
  ' return { text: (node.textContent || "").trim().slice(0, 60),' +
  ' x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) } }))()'

/**
 * First-run modals cover the centre of the page and swallow clicks. Dismiss
 * whatever is left of them: a throwaway home is exactly where they appear.
 */
async function dismissModals(browser) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const closed = await browser.evaluate(
      '(() => { const roots = [...document.querySelectorAll("[role=dialog], [aria-modal], [data-dsh-modal]")];' +
        ' if (roots.length === 0) roots.push(document.body);' +
        ' for (const dialog of roots) { const buttons = [...dialog.querySelectorAll("button")];' +
        ' const button = buttons.find((node) => { const text = (node.textContent || "").trim();' +
        ' return /(continue|got it|close|dismiss|cancel|not now|later|skip|ok)$/i.test(text) || /稍后|以后|跳过|关闭|取消|知道了|继续/.test(text) || /close/i.test(node.getAttribute("aria-label") ?? "") });' +
        ' if (button && button.offsetParent !== null) { button.click(); return true } } return false })()',
    )
    if (!closed) return
    await sleep(500)
  }
}

/**
 * Type the demo question and wait for the answer. This is the only way to get a
 * user bubble: a headless turn persists the prompt in the inbox, not as a
 * message the transcript renders, and the README is about how a real turn looks.
 */
async function seedDemoSession(browser) {
  const rows = await browser.evaluate(TREE_ROWS)
  const fresh = rows.find((row) => /^(新会话|New Session)$/.test(row.text))
  if (fresh !== undefined) await browser.click(fresh.x, fresh.y)
  await sleep(1200)

  const input = await centre(browser, '[data-composer-input]')
  if (input === null) throw new Error('no composer input')
  await browser.click(input[0], input[1])
  await sleep(300)
  await browser.send('Input.insertText', { text: DEMO_PROMPT })
  await sleep(400)
  for (const type of ['keyDown', 'keyUp']) {
    await browser.send('Input.dispatchKeyEvent', {
      type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
    })
  }
  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(500)
    if (await browser.evaluate('!!document.querySelector(".md-code-block, pre, table")')) break
  }
  await sleep(1200)
}

/** Open the demo session (the workspace row carrying DEMO_PROMPT's session). */
async function openDemoSession(browser) {
  const rows = await browser.evaluate(TREE_ROWS)
  const session = rows.find((row) => /OKLCH/.test(row.text))
  if (session === undefined) throw new Error('no demo session in the sidebar: ' + JSON.stringify(rows.map((row) => row.text)))
  await browser.click(session.x, session.y)
  await sleep(2600)
  // Top of the transcript: the bubble is visible and the last line lands under
  // the composer. Scrolled to the bottom, the bubble would be clipped instead.
  await browser.evaluate(
    '(() => { const nodes = [...document.querySelectorAll("div")].filter((node) => node.scrollHeight > node.clientHeight + 60);' +
      ' const body = nodes.sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0];' +
      ' if (body) body.scrollTop = 0; return true })()',
  )
  await sleep(400)
  // Park the pointer away from the transcript: a hover card would land in frame.
  await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2, button: 'none', buttons: 0 })
  await sleep(200)
}

const setAccent = (browser, accent) =>
  browser.evaluate('window.dispatchEvent(new CustomEvent("dsh-theme-mist:accent", { detail: ' + JSON.stringify(accent) + ' }))')

const setMaterial = (browser, material) =>
  browser.evaluate('window.dispatchEvent(new CustomEvent("dsh-theme-mist:sidebar-material", { detail: ' + JSON.stringify(material) + ' }))')

/* -------------------------------------------------------------------- WebP */
/**
 * Chromium's PNG in, WebP out, through the browser itself so the tool needs no
 * image library: a 2x screenshot is decoded in a page and re-encoded by the
 * canvas codec at the requested quality.
 */
async function toWebP(browser, png, quality = 88) {
  const base64 = png.toString('base64')
  const dataUrl = await browser.evaluate(`(async () => {
    const image = new Image()
    image.src = 'data:image/png;base64,${base64}'
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    canvas.getContext('2d').drawImage(image, 0, 0)
    return canvas.toDataURL('image/webp', ${quality / 100})
  })()`)
  return Buffer.from(String(dataUrl).split(',')[1], 'base64')
}

/** Crop a 2x frame in the page and hand back WebP (used for the sidebar column). */
async function cropWebP(browser, png, box, quality = 88) {
  const base64 = png.toString('base64')
  const dataUrl = await browser.evaluate(`(async () => {
    const image = new Image()
    image.src = 'data:image/png;base64,${base64}'
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = ${box.width}
    canvas.height = ${box.height}
    canvas.getContext('2d').drawImage(image, ${box.x}, ${box.y}, ${box.width}, ${box.height}, 0, 0, ${box.width}, ${box.height})
    return canvas.toDataURL('image/webp', ${quality / 100})
  })()`)
  return Buffer.from(String(dataUrl).split(',')[1], 'base64')
}

/* --------------------------------------------------------------- composites */
/**
 * A light frame and a dark frame of the same page, cut along one diagonal.
 *
 * Needs a real image pipeline (per-pixel blend), so it runs in Node rather than
 * in the browser: decode both PNGs, walk the pixels once, hand the result back.
 * The cheap PNG reader in png-pixels.mjs only reads, and decoding 2560x1600
 * through a canvas and back would round-trip the colour for nothing.
 */
async function compositeSplit(browser, lightPng, darkPng) {
  const [lightUrl, darkUrl] = await Promise.all([
    (async () => browser.evaluate(`(async () => {
      const image = new Image(); image.src = 'data:image/png;base64,${lightPng.toString('base64')}'; await image.decode()
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
      const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0)
      window.__splitLight = context.getImageData(0, 0, canvas.width, canvas.height)
      return canvas.width + 'x' + canvas.height
    })()`))(),
    (async () => browser.evaluate(`(async () => {
      const image = new Image(); image.src = 'data:image/png;base64,${darkPng.toString('base64')}'; await image.decode()
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
      const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0)
      window.__splitDark = context.getImageData(0, 0, canvas.width, canvas.height)
      return canvas.width + 'x' + canvas.height
    })()`))(),
  ])
  const [width, height] = String(lightUrl).split('x').map(Number)
  if (darkUrl !== lightUrl) throw new Error('frame sizes differ: ' + lightUrl + ' vs ' + darkUrl)

  const dataUrl = await browser.evaluate(`(() => {
    const width = ${width}, height = ${height}
    const light = window.__splitLight, dark = window.__splitDark
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = height
    const context = canvas.getContext('2d')
    const out = context.createImageData(width, height)
    const leftY = ${SPLIT_LEFT_Y}, rightY = ${SPLIT_RIGHT_Y}
    for (let y = 0; y < height; y++) {
      const yn = y / (height - 1)
      for (let x = 0; x < width; x++) {
        // The seam is a function of x only: one straight line from the left edge
        // to the right one, so both halves stay whole rectangles of the frame.
        const edge = leftY + (rightY - leftY) * (x / (width - 1))
        const target = yn < edge ? light.data : dark.data
        const index = (y * width + x) * 4
        out.data[index] = target[index]
        out.data[index + 1] = target[index + 1]
        out.data[index + 2] = target[index + 2]
        out.data[index + 3] = 255
      }
    }
    context.putImageData(out, 0, 0)
    return canvas.toDataURL('image/png')
  })()`)

  // The divider: a white core with a soft shadow beneath, drawn over the seam so
  // the cut reads as a deliberate edge instead of a rendering fault. 2x pixels,
  // so 4px here is the 1.5px hairline the README shows at 1280 wide.
  const withSeam = await browser.evaluate(`(async () => {
    const image = new Image(); image.src = ${JSON.stringify(dataUrl)}; await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0)
    const leftY = ${SPLIT_LEFT_Y}, rightY = ${SPLIT_RIGHT_Y}
    const from = [0, leftY * (canvas.height - 1)], to = [canvas.width - 1, rightY * (canvas.height - 1)]
    const draw = (colour, width, blur, offsetY) => {
      context.save()
      context.filter = blur > 0 ? 'blur(' + blur + 'px)' : 'none'
      context.strokeStyle = colour
      context.lineWidth = width
      context.beginPath()
      context.moveTo(from[0], from[1] + offsetY)
      context.lineTo(to[0], to[1] + offsetY)
      context.stroke()
      context.restore()
    }
    draw('rgba(11,21,45,0.27)', 8, 8, 3)
    draw('rgba(255,255,255,0.35)', 10, 6, 0)
    draw('rgba(255,255,255,0.88)', 4, 0.6, 0)
    draw('rgba(255,255,255,1)', 2, 0, 0)
    return canvas.toDataURL('image/webp', 0.88)
  })()`)
  return Buffer.from(String(withSeam).split(',')[1], 'base64')
}

/* ------------------------------------------------------------------ the run */
let stub
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

async function waitForUrl(child) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const match = child.output.match(/http:\/\/127\.0\.0\.1:(\d+)\/\?token=[\w-]+/)
    if (match !== null) return match[0]
    if (child.exitCode !== null) throw new Error('server exited: ' + child.output.slice(-400))
    await sleep(200)
  }
  throw new Error('server never printed a URL: ' + child.output.slice(-400))
}

/** Boot one appearance, photograph everything that appearance can show. */
async function capture(appearance, home, seed) {
  const look = join(home, 'look-' + appearance + '.yml')
  await writeFile(look, [
    '- id: ui-theme',
    '  config:',
    '    preference: ' + appearance,
    '- id: locale',
    '  config:',
    '    preference: zh',
    '',
  ].join('\n'))

  const chromeProfile = await mkdtemp(join(tmpdir(), 'dsh-theme-mist-album-chrome-'))
  const port = await freePort()
  const server = start('node', [BIN, '--profile', 'web', '--patch', join(home, 'model.yml'), '--patch', look,
    '--no-open', '--port', String(port)], { env: { ...process.env, DSH_HOME: home }, cwd: REPO })
  let browser
  try {
    const url = await waitForUrl(server)
    const debugPort = await freePort()
    start(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--remote-debugging-port=' + debugPort, '--user-data-dir=' + chromeProfile,
      '--window-size=' + WIDTH + ',' + HEIGHT, 'about:blank'])
    browser = await Browser.connect(debugPort)
    await browser.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: DPR, mobile: false })
    await browser.send('Page.navigate', { url })
    for (let attempt = 0; attempt < 240; attempt++) {
      if (await browser.evaluate('!!document.querySelector("[data-slot=sidebar]")')) break
      await sleep(250)
    }
    await sleep(2500)
    await dismissModals(browser)
    check(appearance + ': the plugin mounted', await browser.evaluate('document.body.hasAttribute("data-dsh-theme-mist")'))

    if (seed) await seedDemoSession(browser)
    await openDemoSession(browser)
    check(appearance + ': the demo turn rendered', await browser.evaluate('document.querySelectorAll(".md-code-block, table").length > 0'))

    const frames = {}
    for (const accent of ACCENTS) {
      await setAccent(browser, accent)
      await sleep(450)
      const applied = await browser.evaluate('document.body.getAttribute("data-dsh-theme-mist-accent")')
      check(appearance + '/' + accent + ': accent applied', applied === accent, String(applied))
      frames[accent] = await browser.shotBuffer()
    }

    const extra = {}
    if (seed) {
      /**
       * The sidebar column, in both materials. The crop runs past the panel's edge
       * — 140px of the content area — because the difference is *at* that edge: a
       * hairline and a 28px corner on one side, a soft gradient on the other. Cut
       * exactly on the boundary and half of that is outside the frame.
       *
       * Both frames have to be the same accent: the sweep above ends on graphite,
       * and a flat sidebar in graphite next to a sheet one in mist reads as a
       * colour difference rather than a material one.
       */
      await setAccent(browser, 'mist')
      await sleep(400)
      const sheetFrame = await browser.shotBuffer()
      const sidebarBox = { x: 0, y: 0, width: (280 + SIDEBAR_EDGE) * DPR, height: SIDEBAR_CROP * DPR }
      const sheetCrop = await cropWebP(browser, sheetFrame, sidebarBox)
      await setMaterial(browser, 'flat')
      await sleep(600)
      const flatMaterial = await browser.evaluate('document.body.getAttribute("data-dsh-theme-mist-sidebar")')
      check('sidebar material switches to flat', flatMaterial === 'flat', String(flatMaterial))
      const flatFrame = await browser.shotBuffer()
      const flatCrop = await cropWebP(browser, flatFrame, sidebarBox)
      await setMaterial(browser, 'sheet')
      await sleep(400)

      // Back to the default accent: the settings frame should show the state a
      // reader starts from, not whatever the sweep ended on.
      await setAccent(browser, 'mist')
      await sleep(400)

      // Settings -> General: the official appearance rows and our two rows in one frame.
      const launcher = await centre(browser, '[data-slot="settings.launcher"] button, [data-slot="settings.trigger"] button')
      if (launcher !== null) await browser.click(launcher[0], launcher[1])
      await sleep(1200)
      const menuItem = await centre(browser, '[role=menuitem]')
      const settingsItem = await browser.evaluate(
        '(() => { const entry = [...document.querySelectorAll("[role=menuitem]")].find((node) => /^(settings|设置)$/i.test((node.innerText ?? "").trim()));' +
          ' if (!entry) return null; const box = entry.getBoundingClientRect();' +
          ' return [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)] })()',
      )
      if (settingsItem !== null) await browser.click(settingsItem[0], settingsItem[1])
      else if (menuItem !== null) await browser.click(menuItem[0], menuItem[1])
      await sleep(1500)
      for (let attempt = 0; attempt < 3; attempt++) {
        const rows = await browser.evaluate('document.querySelectorAll(\'[data-slot="settings.general.item"]\').length')
        if (rows > 0) break
        const general = await browser.evaluate(
          '(() => { const entry = [...document.querySelectorAll("[role=dialog] *")].find((node) => /^(general|通用|常规)$/i.test((node.textContent ?? "").trim()) && node.getBoundingClientRect().width < 240);' +
            ' if (!entry) return null; const box = entry.getBoundingClientRect();' +
            ' return [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)] })()',
        )
        if (general === null) break
        await browser.click(general[0], general[1])
        await sleep(1200)
      }
      // Swatches only: the row's title element shares the id prefix.
      const accentRows = await browser.evaluate('document.querySelectorAll("[id^=dsh-theme-mist-accent-][role=radio]").length')
      check('settings shows the six swatches', accentRows === 6, String(accentRows))
      const settingsFrame = await browser.shotBuffer()
      // Only the dialog: the page behind it is a screenshot of a screenshot, and
      // at README width it just shrinks the rows that matter.
      const dialog = await browser.evaluate(
        '(() => { const node = document.querySelector("[role=dialog]"); if (!node) return null;' +
          ' const box = node.getBoundingClientRect();' +
          ' return [box.x, box.y, box.width, box.height].map((value) => Math.round(value * (window.devicePixelRatio || 1))) })()',
      )
      extra.settings = dialog === null
        ? settingsFrame
        : await cropWebP(browser, settingsFrame, { x: dialog[0], y: dialog[1], width: dialog[2], height: dialog[3] })
      check('settings frame is the dialog only', dialog !== null, dialog === null ? 'no [role=dialog]' : String(dialog[2]) + 'x' + String(dialog[3]) + 'px')

      // Close again, so the last frames are the plain page.
      await browser.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
      await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
      await sleep(800)
      extra.sidebarSheet = sheetCrop
      extra.sidebarFlat = flatCrop
      check('no page exception', browser.exceptions.length === 0, JSON.stringify(browser.exceptions.slice(0, 2)))
    }

    return { frames, extra }
  } finally {
    browser?.socket.close()
    server.kill('SIGKILL')
    await sleep(400)
    await rm(chromeProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {})
  }
}

const home = await mkdtemp(join(tmpdir(), 'dsh-theme-mist-album-'))
try {
  console.log('info throwaway DSH_HOME ' + home)
  const install = start('node', [BIN, 'plugin', '--profile', 'web', 'add', REPO], { env: { ...process.env, DSH_HOME: home } })
  await new Promise((resolve) => install.once('exit', resolve))
  if (install.exitCode !== 0) throw new Error('plugin install failed: ' + install.output.slice(-400))

  /**
   * The sidebar reads its workspace titles from the profile's own storage. A
   * fresh home would say "default-workspace"; the README should show the project
   * the theme is made for, and the demo session lands in it by path.
   */
  const workspaceId = '5f0f2a1e-0000-4000-8000-000000000001'
  await mkdir(join(home, 'storages'), { recursive: true })
  await writeFile(join(home, 'storages', 'workspace.json'), JSON.stringify({
    unit: { name: 'workspace', version: 2 },
    global: {
      initialized: true,
      workspaceIds: [workspaceId],
      archivedSessionIds: [],
      pinnedSessionIds: [],
      defaultWorkspaceId: workspaceId,
    },
    tables: {
      workspaces: {
        [workspaceId]: {
          path: REPO,
          title: 'dsh-theme-mist',
          sessionIds: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    },
  }, null, 2) + '\n')

  stub = await startStub()
  const model = join(home, 'model.yml')
  await writeFile(model, [
    '- id: agent-default-model',
    '  name: "@deepseek-ai/dsh-agent-default-model"',
    '  config:',
    '    provider: workbuddy-local',
    '    model: deepseek-v4.1-flash',
    '    reasoningEffort: max',
    '- id: llm-pi-ai',
    '  name: "@deepseek-ai/dsh-llm-pi-ai"',
    '  config:',
    '    providers:',
    '      workbuddy-local:',
    '        displayName: DeepSeek',
    '        api: openai-completions',
    '        apiKeyEnv: DSH_THEME_MIST_PREVIEW_KEY',
    '        baseURL: http://127.0.0.1:' + stub.port + '/v1',
    '        models:',
    '          - id: deepseek-v4.1-flash',
    '            name: DeepSeek-V4.1-Flash',
    '            contextWindow: 1000000',
    '            maxTokens: 384000',
    '            input:',
    '              - text',
    '              - image',
    '            reasoningEfforts:',
    '              low: low',
    '              high: high',
    '              max: max',
    '',
  ].join('\n'))
  process.env.DSH_THEME_MIST_PREVIEW_KEY = 'preview'

  const light = await capture('light', home, true)
  const dark = await capture('dark', home, false)

  // Both runs are done with their browsers; the encode step needs one of its
  // own, and nothing else.
  const encoderPort = await freePort()
  const encoderProfile = await mkdtemp(join(tmpdir(), 'dsh-theme-mist-album-encode-'))
  start(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=' + encoderPort, '--user-data-dir=' + encoderProfile, 'about:blank'])
  const encoder = await Browser.connect(encoderPort)

  try {
    const accentsDir = join(OUT, 'accents')
    await mkdir(accentsDir, { recursive: true })
    const sizes = []
    for (const accent of ACCENTS) {
      const webp = await compositeSplit(encoder, light.frames[accent], dark.frames[accent])
      await writeFile(join(accentsDir, accent + '.webp'), webp)
      sizes.push(accent + ' ' + Math.round(webp.length / 1024) + ' KB')
    }
    console.log('info accents: ' + sizes.join(', '))

    const heroLight = await toWebP(encoder, light.frames.mist)
    const heroDark = await toWebP(encoder, dark.frames.mist)
    await writeFile(join(OUT, 'hero-light.webp'), heroLight)
    await writeFile(join(OUT, 'hero-dark.webp'), heroDark)
    await writeFile(join(OUT, 'settings.webp'), await toWebP(encoder, light.extra.settings))
    await writeFile(join(OUT, 'sidebar-sheet.webp'), light.extra.sidebarSheet)
    await writeFile(join(OUT, 'sidebar-flat.webp'), light.extra.sidebarFlat)
    console.log('info sizes KB — hero ' + Math.round(heroLight.length / 1024) + '/' + Math.round(heroDark.length / 1024)
      + ', settings ' + Math.round((light.extra.settings.length / 1024)) + ' (png)'
      + ', sidebar ' + Math.round(light.extra.sidebarSheet.length / 1024) + '/' + Math.round(light.extra.sidebarFlat.length / 1024))
    console.log('info wrote ' + OUT)
  } finally {
    encoder?.socket.close()
    await rm(encoderProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {})
  }
} finally {
  stub?.server.close()
  for (const child of children) if (child.exitCode === null) child.kill('SIGKILL')
  await sleep(300)
  await rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {})
}

console.log(failures.length === 0 ? 'ALL PASS (' + checks + ' checks)' : 'FAILURES: ' + failures.join(' | '))
process.exit(failures.length === 0 ? 0 : 1)
