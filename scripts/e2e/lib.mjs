/* The end-to-end harness: launches a from-source Foolscap in an isolated
 * profile with the test bridge on, and drives it over the Chrome DevTools
 * Protocol with trusted input events — the app sees exactly what a user's
 * keyboard and mouse produce. See docs/adr/0001-testing.md for when a
 * change needs a case here. Node 22+ (built-in WebSocket), no dependencies. */
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export const ROOT = resolve(import.meta.dirname, '../..')
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let nextPort = 9400 + (process.pid % 200)

/* One app instance: its own userData (session, positions, history, lock),
 * its own working folder for documents, its own debugging port. */
export async function launch({ files = [], edition } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'foolscap-e2e-'))
  const userData = join(dir, 'userdata')
  const docs = join(dir, 'docs')
  await Promise.all([mkdirp(userData), mkdirp(docs)])
  // A fixed window so coordinates are stable across runs and machines.
  await writeFile(join(userData, 'window-state.json'), JSON.stringify({ x: 80, y: 60, width: 1200, height: 800 }))
  const written = []
  for (const [name, content] of Object.entries(files)) {
    const path = join(docs, name)
    await writeFile(path, content)
    written.push(path)
  }
  const port = nextPort++
  const child = spawn(
    join(ROOT, 'node_modules/.bin/electron'),
    ['.', ...written, `--remote-debugging-port=${port}`, '--remote-allow-origins=*'],
    {
      cwd: ROOT,
      env: { ...process.env, FOOLSCAP_USER_DATA: userData, FOOLSCAP_E2E: '1', ...(edition ? { FOOLSCAP_EDITION: edition } : {}) },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )
  const log = []
  child.stdout.on('data', (d) => log.push(String(d)))
  child.stderr.on('data', (d) => log.push(String(d)))
  const exited = new Promise((r) => child.on('exit', (code, signal) => r({ code, signal })))
  const cdp = await connect(port)
  const app = {
    dir, userData, docs, paths: Object.fromEntries(Object.keys(files).map((n, i) => [n, written[i]])),
    child, log, exited, ...cdp,
    async close() {
      if (child.exitCode === null) child.kill('SIGTERM')
      const r = await Promise.race([exited, sleep(6000).then(() => null)])
      if (child.exitCode === null) child.kill('SIGKILL')
      try { cdp.ws.close() } catch {}
      await rm(dir, { recursive: true, force: true })
      return r
    }
  }
  await app.ready()
  return app
}

async function mkdirp(p) {
  const { mkdir } = await import('node:fs/promises')
  await mkdir(p, { recursive: true })
}

async function connect(port) {
  let ws
  for (let i = 0; i < 120 && !ws; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      const page = list.find((t) => t.type === 'page' && t.url.includes('index.html'))
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl)
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
      }
    } catch { /* not up yet */ }
    if (!ws) await sleep(250)
  }
  if (!ws) throw new Error(`no page target on port ${port}`)
  let id = 0
  const pending = new Map()
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
  }
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id
      pending.set(i, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)))
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  /* Evaluate in the page; the expression may be a promise. `$` is the test
   * bridge (window.__foolscap), `view` its editor view. */
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression: `(() => { const $ = window.__foolscap; const view = $?.view; return (${expression}) })()`,
      returnByValue: true, awaitPromise: true
    })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails))
    return r.result.value
  }
  const KEYS = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, End: 35, Home: 36 }
  const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 }
  /* A trusted key press. `mods` is any of alt/ctrl/meta/shift. */
  const key = async (name, mods = []) => {
    const modifiers = mods.reduce((m, k) => m | MOD[k], 0)
    const vk = KEYS[name] ?? name.toUpperCase().charCodeAt(0)
    const code = KEYS[name] ? name : name.length === 1 ? `Key${name.toUpperCase()}` : name
    const text = name.length === 1 && !(modifiers & MOD.meta) && !(modifiers & MOD.ctrl) ? name : undefined
    await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: name, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers, text, unmodifiedText: text })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers })
  }
  const type = async (text) => {
    for (const ch of text) {
      if (/[a-z0-9]/i.test(ch)) await key(ch, ch !== ch.toLowerCase() ? ['shift'] : [])
      else await send('Input.dispatchKeyEvent', { type: 'char', text: ch })
    }
  }
  const click = async (x, y, { clicks = 1, mods = [] } = {}) => {
    const modifiers = mods.reduce((m, k) => m | MOD[k], 0)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, modifiers })
    for (let n = 1; n <= clicks; n++) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: n, modifiers })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: n, modifiers })
    }
  }
  /* Wait for the bridge, dismiss the first-run help, bring the window up
   * (an occluded window stops painting, which stalls some measurements). */
  const ready = async () => {
    for (let i = 0; i < 80; i++) {
      if (await evaluate(`!!window.__foolscap && $.tabs() !== null`)) break
      await sleep(250)
    }
    if (!(await evaluate(`!!window.__foolscap`))) throw new Error('test bridge never appeared — was the build made with FOOLSCAP_E2E honored?')
    await sleep(600)
    if (await evaluate(`!document.querySelectorAll('.preview')[1].hidden`)) { await key('Escape'); await sleep(300) }
    await send('Page.bringToFront')
  }
  /* Poll until `expression` is truthy, or fail with the last value. */
  const until = async (expression, { timeout = 8000, every = 100, label = expression } = {}) => {
    const t0 = Date.now()
    let last
    while (Date.now() - t0 < timeout) {
      last = await evaluate(expression)
      if (last) return last
      await sleep(every)
    }
    throw new Error(`timed out waiting for ${label} (last: ${JSON.stringify(last)})`)
  }
  const previewVisible = () => evaluate(`!document.querySelector('.preview').hidden`)
  const cmd = (k) => key(k, ['meta'])
  return { ws, send, evaluate, key, type, click, cmd, ready, until, previewVisible }
}

/* A tiny assertion vocabulary so cases read as prose. */
export function expect(actual, message) {
  return {
    toBe(expected) { if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`) },
    toBeTruthy() { if (!actual) throw new Error(`${message}: expected truthy, got ${JSON.stringify(actual)}`) },
    toContain(s) { if (!String(actual).includes(s)) throw new Error(`${message}: expected to contain ${JSON.stringify(s)}, got ${JSON.stringify(actual)}`) },
    toBeGreaterThan(n) { if (!(actual > n)) throw new Error(`${message}: expected > ${n}, got ${JSON.stringify(actual)}`) },
    toBeCloseTo(n, within) { if (Math.abs(actual - n) > within) throw new Error(`${message}: expected within ${within} of ${n}, got ${JSON.stringify(actual)}`) }
  }
}

/* Fixture text: a long document, deterministic, with every construct the
 * live preview draws. */
export function longDocument(paragraphs = 120) {
  const words = 'the quick brown fox jumps over the lazy dog while considering typographical responsibilities'.split(' ')
  let seed = 7
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  const lines = ['# A Long Document', '', 'Being **bold** and *italic* with `code`.', '']
  for (let i = 0; i < paragraphs; i++) {
    if (i % 12 === 0) lines.push(`## Section ${i / 12 + 1}`, '')
    const n = 18 + Math.floor(rand() * 20)
    lines.push(Array.from({ length: n }, () => words[Math.floor(rand() * words.length)]).join(' ') + '.', '')
  }
  lines.push('| a | b |', '| --- | --- |', '| 1 | 2 |', '', '- [ ] one', '- [x] two', '')
  return lines.join('\n')
}
