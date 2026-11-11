// Smoke-test runner: launches the built app with a remote-debugging port, drives it over the
// Chrome DevTools Protocol and runs one check module from scripts/checks/<name>.mjs.
//   usage: npm run build && node scripts/smoke.mjs <check>
import { spawn, execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const name = process.argv[2]
if (!name) throw new Error('usage: node scripts/smoke.mjs <check>')
const PORT = 9333
const out = resolve('.smoke')
mkdirSync(out, { recursive: true })

const electron = resolve('node_modules/electron/dist/electron.exe')
const child = spawn(electron, ['.', `--remote-debugging-port=${PORT}`, `--user-data-dir=${resolve('.smoke/userdata')}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
})
let log = ''
child.stdout.on('data', (d) => (log += d))
child.stderr.on('data', (d) => (log += d))
const kill = () => {
  try {
    execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' })
  } catch {
    /* already gone */
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function findPage() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const p = list.find((t) => t.type === 'page' && !t.url.startsWith('devtools'))
      if (p) return p
    } catch {
      /* not up yet */
    }
    await sleep(500)
  }
  throw new Error('app window did not appear\n' + log)
}

let exitCode = 0
try {
  const page = await findPage()
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r, j) => {
    ws.onopen = r
    ws.onerror = j
  })
  let id = 0
  const pending = new Map()
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data)
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d)
      pending.delete(d.id)
    }
  }
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id
      pending.set(i, res)
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  const h = {
    async ev(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (r.result.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails))
      return r.result.result.value
    },
    async waitFor(expression, what = expression, timeout = 20000) {
      const t0 = Date.now()
      while (Date.now() - t0 < timeout) {
        try {
          const v = await h.ev(expression)
          if (v) return v
        } catch {
          /* page may be reloading */
        }
        await sleep(250)
      }
      throw new Error('timeout waiting for: ' + what)
    },
    click: (sel) => h.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)throw new Error('no element '+${JSON.stringify(sel)});e.click();return true})()`),
    text: (sel = 'body') => h.ev(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? null`),
    sleep,
    async shot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(resolve(out, file), Buffer.from(r.result.data, 'base64'))
      console.log('screenshot:', resolve(out, file))
    },
    assert(cond, msg) {
      if (!cond) throw new Error('ASSERT FAILED: ' + msg)
      console.log('ok  -', msg)
    },
    log: () => log
  }
  await send('Runtime.enable')
  await send('Page.enable')
  await sleep(1200)
  const mod = await import(pathToFileURL(resolve(`scripts/checks/${name}.mjs`)).href)
  await mod.default(h)
  console.log('CHECK PASSED:', name)
} catch (e) {
  console.error('CHECK FAILED:', name, '\n', e.message)
  exitCode = 1
} finally {
  kill()
  process.exit(exitCode)
}
