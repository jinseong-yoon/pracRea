import { spawnSync } from 'node:child_process'
// Feature 4. Needs container bxt-log: prints "out N" on stdout and "err N" on stderr every second.
export default async (h) => {
  await h.waitFor(`!!document.querySelector('[data-name=bxt-log] .link')`, 'bxt-log row')
  await h.ev(`document.querySelector('[data-name=bxt-log] .link').click()`)
  await h.waitFor(`document.querySelectorAll('.logline').length >= 4`, 'log lines streamed')
  const first = await h.ev(`(()=>{const l=document.querySelector('.logline'); return {svc:l.querySelector('.svc').innerText, msg:l.querySelector('.msg').innerText, ts:l.querySelector('.ts').innerText}})()`)
  h.assert(first.svc === 'bxt-log', 'service name from container (' + first.svc + ')')
  h.assert(/^(out|err) \d+$/.test(first.msg), 'timestamp prefix stripped from content: "' + first.msg + '"')
  h.assert(/^\d\d:\d\d:\d\d\.\d{3}$/.test(first.ts), 'timestamp parsed: ' + first.ts)
  h.assert(await h.ev(`!!document.querySelector('.logline.stderr')`), 'stderr lines are distinguished from stdout')
  const color = await h.ev(`document.querySelector('.logline .svc').style.color`)
  h.assert(!!color, 'service colour applied: ' + color)

  // Clear: hides what is shown, keeps streaming, does not touch the engine
  const before = await h.ev(`document.querySelectorAll('.logline').length`)
  await h.click('[data-testid=clear-logs]')
  await h.waitFor(`document.querySelectorAll('.logline').length < ${before}`, 'lines hidden after Clear')
  h.assert((await h.ev(`document.querySelectorAll('.logline').length`)) <= 2, 'only post-clear lines remain')
  await h.waitFor(`document.querySelectorAll('.logline').length >= 2`, 'new lines still arrive after Clear', 15000)
  // the engine's own log is untouched: the CLI still sees every earlier line
  const r = spawnSync('docker', ['logs', 'bxt-log'], { encoding: 'utf8' }) // stdout + stderr of the container
  const cliLines = (r.stdout + r.stderr).split('\n').filter(Boolean).length
  h.assert(cliLines >= before, 'engine log still has >= ' + before + ' lines (CLI sees ' + cliLines + ')')
  // Inspect tab
  await h.click('[data-testid=tab-inspect]')
  await h.waitFor(`!!document.querySelector('[data-testid=inspect-json]')`, 'inspect json')
  const j = JSON.parse(await h.text('[data-testid=inspect-json]'))
  h.assert(j.Name === '/bxt-log' && j.State.Running === true, 'inspect shows engine data: ' + j.Name)
  // Clear marker survives tab switches (it is redux state, not a deletion)
  await h.click('[data-testid=tab-logs]')
  await h.waitFor(`document.querySelectorAll('.logline').length >= 1`, 'logs again')
  const earliest = await h.ev(`document.querySelector('.logline .ts').innerText`)
  await h.shot('logs.png')
  console.log('earliest visible line after returning:', earliest)
}
