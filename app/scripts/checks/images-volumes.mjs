// Feature 7: images (in-use flag, delete one tag, prune) and volumes (size, create, delete, prune).
// Prune steps run only when the engine has NOTHING else that could be pruned (checked through the CLI first),
// so no pre-existing user data can be touched by the test.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const docker = (...a) => execFileSync('docker', a, { encoding: 'utf8' }).trim()
const build = (tag, label) => {
  const d = mkdtempSync(join(tmpdir(), 'bxt-'))
  writeFileSync(join(d, 'Dockerfile'), `FROM redis:7-alpine\nLABEL bxt=${label}\n`)
  docker('build', '-q', '-t', tag, d)
}
const clickText = (sel, text) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find(b=>b.innerText.trim()===${JSON.stringify(text)}).click()`
const nav = (h, name) => h.click(`[data-testid=nav-${name}]`)

export default async (h) => {
  await h.waitFor(`!!document.querySelector('[data-testid=container-grid]')`, 'app ready')

  /* ---------- images ---------- */
  build('bxt-del:1', 'del')
  build('bxt-dang:1', 'unused')
  await nav(h, 'images')
  await h.waitFor(`!!document.querySelector('[data-testid=image-grid]')`, 'image grid')
  await h.waitFor(`!!document.querySelector('[data-name="bxt-del:1"]')`, 'built image listed')
  h.assert(await h.ev(`document.querySelector('[data-name="redis:7-alpine"] [data-testid=in-use]')?.innerText.startsWith('In use')`), 'redis:7-alpine flagged In use (bxt-* containers use it)')
  h.assert(!(await h.ev(`!!document.querySelector('[data-name="bxt-del:1"] [data-testid=in-use]')`)), 'bxt-del:1 is unused')

  // delete exactly one tag
  await h.ev(`document.querySelector('[data-name="bxt-del:1"] button.danger').click()`)
  await h.ev(clickText('.modal button', 'Delete'))
  await h.waitFor(`!document.querySelector('[data-name="bxt-del:1"]')`, 'bxt-del:1 gone from list')
  h.assert(!docker('images', '-q', 'bxt-del:1'), 'engine no longer has bxt-del:1')
  h.assert(!!docker('images', '-q', 'redis:7-alpine'), 'redis:7-alpine untouched')

  // prune. This engine (containerd image store) drops a re-tagged image at once, so no dangling image can be
  // produced; the default prune must therefore remove nothing, and "all unused" is exercised with a safety guard.
  const popPrune = async (all) => {
    await h.ev(`[...document.querySelectorAll('.page-head button')].find(b=>b.innerText.startsWith('Prune')).click()`)
    await h.waitFor(`!!document.querySelector('.modal')`, 'prune dialog')
    if (all) await h.click('[data-testid=prune-all]')
    await h.ev(clickText('.modal button', 'Prune'))
  }
  await h.ev(`[...document.querySelectorAll('.page-head button')].find(b=>b.innerText.startsWith('Prune')).click()`)
  await h.waitFor(`!!document.querySelector('.modal')`, 'prune dialog')
  h.assert(!(await h.ev(`document.querySelector('[data-testid=prune-all]').checked`)), 'prune defaults to dangling only')
  await h.ev(clickText('.modal button', 'Prune'))
  await h.waitFor(`/Pruned 0 image/.test(document.body.innerText)`, 'default prune reports 0 removed')
  h.assert(!!docker('images', '-q', 'bxt-dang:1'), 'tagged unused image kept by default prune')

  // guard: everything unused must be test-owned before "all unused" runs
  const lines = (t) => t.split('\n').filter(Boolean)
  const used = new Set(lines(docker('ps', '-a', '-q')).map((c) => docker('inspect', '--format', '{{.Image}}', c)))
  const unusedImgs = lines(docker('images', '-a', '--no-trunc', '--format', '{{.ID}} {{.Repository}}:{{.Tag}}')).map((l) => l.split(' ')).filter(([id]) => !used.has(id))
  h.assert(unusedImgs.every(([, n]) => n.startsWith('bxt-') || n === 'busybox:1.36'), 'precondition: unused images are test-owned: ' + unusedImgs.map((x) => x[1]).join(', '))
  await popPrune(true)
  await h.waitFor(`!document.querySelector('[data-name="bxt-dang:1"]')`, 'unused images removed by "all unused" prune')
  h.assert(!docker('images', '-q', 'bxt-dang:1'), 'engine removed bxt-dang:1')
  h.assert(!!docker('images', '-q', 'mysql:8.0') && !!docker('images', '-q', 'redis:7-alpine'), 'images used by containers kept (mysql, redis)')
  await h.shot('images.png')

  /* ---------- volumes ---------- */
  await nav(h, 'volumes')
  await h.waitFor(`!!document.querySelector('[data-testid=volume-grid]')`, 'volume grid')
  h.assert(await h.ev(`!!document.querySelector('[data-name=csknow_mysql_data]')`), 'existing volumes listed')
  const sizeText = await h.ev(`document.querySelector('[data-name=csknow_mysql_data] [data-testid=vol-size]').innerText`)
  h.assert(/\d/.test(sizeText) && sizeText !== '—', 'size shown from engine usage data: ' + sizeText)
  // create through the dialog
  await h.ev(`[...document.querySelectorAll('.page-head button')].find(b=>b.innerText.includes('Create')).click()`)
  await h.waitFor(`!!document.querySelector('[data-testid=vol-name]')`, 'create dialog')
  await h.ev(`(()=>{const e=document.querySelector('[data-testid=vol-name]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'bxt-vol1'); e.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await h.ev(clickText('.modal button', 'Create'))
  await h.waitFor(`!!document.querySelector('[data-name=bxt-vol1]')`, 'new volume listed')
  h.assert(docker('volume', 'ls', '-q', '-f', 'name=bxt-vol1') === 'bxt-vol1', 'engine has the volume')
  // delete it
  await h.ev(`document.querySelector('[data-name=bxt-vol1] button.danger').click()`)
  await h.ev(clickText('.modal button', 'Delete'))
  await h.waitFor(`!document.querySelector('[data-name=bxt-vol1]')`, 'volume removed from list')
  h.assert(docker('volume', 'ls', '-q', '-f', 'name=bxt-vol1') === '', 'engine volume deleted')

  // prune. Guard: nothing may be unused BEFORE we create our own leftovers, so the prune can only hit those.
  const listUnused = () => docker('volume', 'ls', '-q', '-f', 'dangling=true').split('\n').filter(Boolean)
  h.assert(listUnused().length === 0, 'precondition: no pre-existing unused volumes')
  // the image declares /data as a volume too, so this leaves two anonymous volumes behind
  docker('create', '--name', 'bxt-anon', '-v', '/bxtanon', 'redis:7-alpine')
  docker('rm', 'bxt-anon') // removed WITHOUT -v: the anonymous volumes stay, unused
  const unused = listUnused()
  h.assert(unused.length >= 1, 'created unused anonymous volumes: ' + unused.length)
  await h.click('[data-testid=nav-containers]')
  await nav(h, 'volumes')
  await h.waitFor(`!!document.querySelector('[data-name="${unused[0]}"]')`, 'unused volume listed')
  await h.ev(`[...document.querySelectorAll('.page-head button')].find(b=>b.innerText.startsWith('Prune')).click()`)
  await h.ev(clickText('.modal button', 'Prune'))
  await h.waitFor(`!document.querySelector('[data-name="${unused[0]}"]')`, 'unused volume gone after prune', 15000)
  h.assert(docker('volume', 'ls', '-q', '-f', 'dangling=true') === '', 'no unused volumes left')
  h.assert(docker('volume', 'ls', '-q', '-f', 'name=csknow_mysql_data') === 'csknow_mysql_data', 'existing named volume kept')
  await h.shot('volumes.png')
}
// cleanup for leftovers of a failed run
export const cleanup = () => {
  for (const args of [['rmi', 'bxt-del:1'], ['rmi', 'bxt-dang:1'], ['rm', 'bxt-anon'], ['volume', 'rm', 'bxt-vol1']]) spawnSync('docker', args, { stdio: 'ignore' })
}
