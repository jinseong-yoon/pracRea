// Feature 6: run form (name/ports/env/volume) + pull progress.
// Needs busybox:1.36 to be absent locally (the pull is observed), redis:7-alpine present.
import { execFileSync } from 'node:child_process'

const setValue = (sel, v) =>
  `(()=>{const e=document.querySelector(${JSON.stringify(sel)}); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(e,${JSON.stringify(v)}); e.dispatchEvent(new Event('input',{bubbles:true}))})()`

export default async (h) => {
  await h.waitFor(`!!document.querySelector('[data-testid=container-grid]')`, 'app ready')

  // 1) pull progress through the stream (aggregated per-layer percentage)
  await h.ev(`(()=>{window.__pull=[];window.__pullDone=false; window.desktopIpcClient.images.dockerPullImage({image:'busybox:1.36'}).subscribe({next:p=>window.__pull.push(p),error:e=>window.__pull.push({error:e.message}),complete:()=>{window.__pullDone=true}}); return true})()`)
  await h.waitFor(`window.__pullDone`, 'pull finished (complete message)', 60000)
  const msgs = await h.ev(`window.__pull`)
  h.assert(!msgs.some((m) => m.error), 'pull had no error')
  const pct = msgs.map((m) => m.percent)
  h.assert(pct.length >= 3, `progress messages received: ${pct.length}`)
  h.assert(pct.every((v, i) => i === 0 || v >= pct[i - 1] - 1) && pct[pct.length - 1] === 100, `percent grows to 100: ${pct.slice(0, 6)}…${pct[pct.length - 1]}`)
  h.assert(execFileSync('docker', ['images', '-q', 'busybox:1.36']).toString().trim().length > 0, 'image now exists locally (CLI)')

  // 2) run form
  await h.ev(`[...document.querySelectorAll('button')].find(b=>b.innerText.includes('Run container')).click()`)
  await h.waitFor(`!!document.querySelector('[data-testid=image-input]')`, 'run page')
  await h.ev(setValue('[data-testid=image-input]', 'redis:7-alpine'))
  await h.ev(setValue('[data-testid=name-input]', 'bxt-run'))
  const addIn = (testId) => h.ev(`[...document.querySelectorAll('[data-testid=${testId}] button')].find(b=>b.innerText.includes('Add')).click()`)
  await addIn('ports')
  await addIn('env')
  await addIn('volumes')
  const fill = (testId, a, b) =>
    h.ev(`(()=>{const ins=[...document.querySelectorAll('[data-testid=${testId}] .row input')]; const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(ins[0],${JSON.stringify(a)}); ins[0].dispatchEvent(new Event('input',{bubbles:true})); set.call(ins[1],${JSON.stringify(b)}); ins[1].dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await fill('ports', '16379', '6379')
  await fill('env', 'GREETING', 'hello world')
  await fill('volumes', 'bxt-runvol', '/data')
  await h.shot('run-form.png')
  await h.click('[data-testid=run-submit]')
  // lands on the new container's detail page
  await h.waitFor(`document.querySelector('.page-head h1')?.innerText.includes('bxt-run')`, 'navigated to new container', 30000)
  const inspect = JSON.parse(execFileSync('docker', ['inspect', 'bxt-run']).toString())[0]
  h.assert(inspect.State.Running === true, 'container is running')
  h.assert(inspect.Config.Env.includes('GREETING=hello world'), 'env applied')
  h.assert(inspect.HostConfig.PortBindings['6379/tcp']?.[0]?.HostPort === '16379', 'port mapping applied')
  h.assert(inspect.HostConfig.Binds?.includes('bxt-runvol:/data'), 'volume bind applied')

  // 3) validation: unknown image surfaces the engine error in the form
  await h.ev(`[...document.querySelectorAll('button')].find(b=>b.innerText.includes('Containers') && b.innerText.includes('←')).click()`)
  await h.ev(`[...document.querySelectorAll('button')].find(b=>b.innerText.includes('Run container')).click()`)
  await h.waitFor(`!!document.querySelector('[data-testid=image-input]')`, 'run page again')
  await h.ev(setValue('[data-testid=image-input]', 'bxt-no-such-image-xyz:1'))
  await h.click('[data-testid=run-submit]')
  await h.waitFor(`!!document.querySelector('[data-testid=run-error]')`, 'error shown for missing image', 40000)
  h.assert(true, 'error text: ' + (await h.text('[data-testid=run-error]')).slice(0, 100))
  await h.shot('run-error.png')
}
