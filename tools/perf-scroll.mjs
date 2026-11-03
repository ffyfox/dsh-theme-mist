#!/usr/bin/env node
/**
 * Scroll-cost comparison for the material layer (CP3, replaces the phase-0
 * T0.4 open item).
 *
 * Runs against a *headful* Chrome on the real GPU — headless renders in
 * software, so its frame timings say nothing about the desktop app (that is
 * exactly why T0.4 stayed open). Two conditions, interleaved, same page:
 *
 *   glass   — the shipped build
 *   no-blur — the same build with --dsh-theme-mist-glass-blur forced to none, so the
 *             only difference is the backdrop-filter on the composer seat
 *
 * Reported per run: frame count, median/p95/max frame interval, share of
 * frames over one vsync (16.7ms) and over two (33.3ms). Chrome on this
 * machine, not Electron: same Chromium, same GPU driver, so it is a proxy,
 * and the measured numbers carry that caveat with them.
 *
 * Usage: node tools/perf-scroll.mjs --url 'http://127.0.0.1:3190/?token=…'
 */
const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf('--' + name)
  return i >= 0 ? argv[i + 1] : fallback
}
const URL_ARG = arg('url')
const CDP_PORT = arg('cdp-port', '9444')
const RUNS = Number(arg('runs', '3'))
const DURATION = Number(arg('duration', '3000'))
if (URL_ARG === undefined) {
  console.error('usage: node tools/perf-scroll.mjs --url <web-url-with-token> [--runs 3] [--duration 3000]')
  process.exit(2)
}

const BASE = 'http://127.0.0.1:' + CDP_PORT
const targets = await (await fetch(BASE + '/json/list')).json()
const page = targets.find((t) => t.type === 'page')
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
await send('Performance.enable')

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error('evaluate: ' + JSON.stringify(result.exceptionDetails).slice(0, 300))
  return result.result.value
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const metrics = async () => {
  const { metrics: list } = await send('Performance.getMetrics')
  const pick = (name) => list.find((m) => m.name === name)?.value ?? 0
  return { task: pick('TaskDuration'), script: pick('ScriptDuration'), layout: pick('LayoutDuration') }
}

/** Scroll the conversation for `ms` and collect the frame intervals. */
const sample = function (ms) {
  const scrollers = [...document.querySelectorAll("[data-slot='main.conversation'] *")]
    .filter((n) => n.scrollHeight > n.clientHeight + 800 && n.clientHeight > 300)
  if (scrollers.length === 0) return Promise.resolve({ error: 'no scroller' })
  const el = scrollers[0]
  el.scrollTop = 0
  return new Promise((resolve) => {
    const frames = []
    const start = performance.now()
    let last = start
    const step = (now) => {
      frames.push(now - last)
      last = now
      el.scrollTop = el.scrollTop + 16
      if (now - start < ms && el.scrollTop + el.clientHeight < el.scrollHeight) requestAnimationFrame(step)
      else resolve({ frames, scrolled: Math.round(el.scrollTop), height: el.scrollHeight })
    }
    requestAnimationFrame(step)
  })
}.toString()

const stats = (frames) => {
  const sorted = [...frames].sort((a, b) => a - b)
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]
  const over = (limit) => frames.filter((f) => f > limit).length
  return {
    frames: frames.length,
    fps: Number((frames.length / (frames.reduce((a, b) => a + b, 0) / 1000)).toFixed(1)),
    p50: Number(at(0.5).toFixed(2)),
    p95: Number(at(0.95).toFixed(2)),
    max: Number(Math.max(...frames).toFixed(2)),
    over17: Number(((over(17.5) / frames.length) * 100).toFixed(1)),
    over33: Number(((over(33.4) / frames.length) * 100).toFixed(1)),
  }
}

const NO_BLUR_CSS = "body[data-dsh-theme-mist] [data-composer-seat][data-conversation-region='composer']{--dsh-theme-mist-glass-blur:none !important}"
const setCondition = async (condition) => {
  const existing = await evaluate("document.getElementById('perf-noblur') !== null")
  if (condition === 'no-blur' && !existing) {
    await evaluate("(() => { const s = document.createElement('style'); s.id = 'perf-noblur'; s.textContent = " + JSON.stringify(NO_BLUR_CSS) + "; document.head.append(s); return true })()")
  } else if (condition === 'glass' && existing) {
    await evaluate("document.getElementById('perf-noblur').remove()")
  }
  await sleep(400)
}

await send('Page.navigate', { url: URL_ARG })
await sleep(8000)
const hasScroller = async () => evaluate("(() => [...document.querySelectorAll(\"[data-slot='main.conversation'] *\")].some((n) => n.scrollHeight > n.clientHeight + 800 && n.clientHeight > 300))()")
/** Centre of the session row to open, in CSS pixels, or null. */
const rowPoint = async (wantText) => evaluate("(() => {"
  + " const rows = [...document.querySelectorAll('[role=treeitem]')].filter((n) => n.offsetParent !== null);"
  + " const named = rows.find((n) => n.textContent !== null && n.textContent.indexOf(" + JSON.stringify(wantText) + ") >= 0);"
  + " const row = named ?? rows[3] ?? rows[0];"
  + " if (row === undefined) return null;"
  + " const r = row.getBoundingClientRect();"
  + " return { x: Math.round(r.x + 40), y: Math.round(r.y + r.height / 2), n: rows.length };"
  + "})()")
const clickAt = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
}
// A fresh browser profile starts with the sidebar collapsed to its icon rail,
// so there are no session rows to click until it is opened. The first button
// in the rail is the toggle.
const openSidebar = async () => evaluate("(() => {"
  + " const root = document.querySelector(\"[data-slot='sidebar'] > *\");"
  + " if (root !== null && root.getBoundingClientRect().width > 120) return 'already-open';"
  + " const first = document.querySelector(\"[data-slot='sidebar'] button\");"
  + " if (first === null) return 'no-toggle';"
  + " first.click(); return 'opened';"
  + "})()")
console.log('sidebar:', await openSidebar())
await sleep(1200)

// The sidebar list arrives after the first session fetch, so wait for rows
// instead of assuming the welcome screen is a conversation.
for (let i = 0; i < 40 && !(await hasScroller()); i += 1) {
  // Any long session works; this one is the longest in the verification
  // profile. The number is arbitrary — the harness only needs turns to scroll.
  const point = await rowPoint('主题插件实现计划')
  if (point !== null && i % 4 === 0) await clickAt(point.x, point.y)
  await sleep(500)
}
if (!(await hasScroller())) throw new Error('no long conversation scroller — open a session with a few turns first')
const ready = await evaluate("document.body.hasAttribute('data-dsh-theme-mist')")
if (!ready) throw new Error('theme is not mounted on this page — is the bundle installed in this profile?')
const blur = await evaluate("(() => { const s = document.querySelector('[data-composer-seat]'); return s === null ? 'no seat' : getComputedStyle(s).backdropFilter })()")
console.log('composer seat backdrop-filter:', blur)

const results = { glass: [], 'no-blur': [] }
for (let i = 0; i < RUNS; i += 1) {
  for (const condition of ['glass', 'no-blur']) {
    await setCondition(condition)
    const before = await metrics()
    const raw = await evaluate('(' + sample + ')(' + DURATION + ')')
    if (raw.error !== undefined) throw new Error('sampling failed: ' + raw.error)
    const after = await metrics()
    const row = { ...stats(raw.frames), taskMs: Math.round((after.task - before.task) * 1000), scrolled: raw.scrolled }
    results[condition].push(row)
    console.log(condition.padEnd(8), JSON.stringify(row))
    await sleep(600)
  }
}
await setCondition('glass')

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}
console.log('')
for (const condition of ['glass', 'no-blur']) {
  const rows = results[condition]
  console.log(condition.padEnd(8), 'median fps', median(rows.map((r) => r.fps)),
    '| p95', median(rows.map((r) => r.p95)), 'ms',
    '| >17ms', median(rows.map((r) => r.over17)) + '%',
    '| >33ms', median(rows.map((r) => r.over33)) + '%')
}
socket.close()
process.exit(0)
