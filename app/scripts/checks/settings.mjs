// Feature 8: getSettings()/updateSettings(partial), {value} wrappers, JSON file, validation, effects.
import { readFileSync, rmSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const file = resolve('.smoke/userdata/settings.json')
const setInput = (testId, v) =>
  `(()=>{const e=document.querySelector('[data-testid=${testId}]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(v)}); e.dispatchEvent(new Event('input',{bubbles:true})); e.focus()})()`
const commit = async (h, testId, v) => {
  await h.ev(setInput(testId, v))
  await h.sleep(150) // let React re-render the typed value, then leave the field like a user would
  await h.ev(`document.querySelector('[data-testid=${testId}]').blur()`)
}

export default async (h) => {
  await h.waitFor(`!!document.querySelector('[data-testid=container-grid]')`, 'app ready')
  await h.click('[data-testid=nav-settings]')
  await h.waitFor(`!!document.querySelector('[data-testid=theme]')`, 'settings page')

  // API shape: every leaf wrapped in { value }; defaults present
  const s = await h.ev(`window.desktopIpcClient.getSettings()`)
  h.assert(s.desktop.theme.value && typeof s.containers.statsIntervalSeconds.value === 'number', 'getSettings returns {value}-wrapped leaves')

  // partial update merges; untouched keys survive
  const r = await h.ev(`window.desktopIpcClient.updateSettings({containers:{logTailLines:{value:50}}})`)
  h.assert(r.containers.logTailLines.value === 50 && r.containers.statsIntervalSeconds.value === s.containers.statsIntervalSeconds.value, 'updateSettings(partial) merges and returns the full object')
  const onDisk = JSON.parse(readFileSync(file, 'utf8'))
  h.assert(onDisk.containers.logTailLines.value === 50, 'written to the local JSON file: ' + file)

  // theme through the UI -> nativeTheme -> prefers-color-scheme
  await h.ev(`(()=>{const s=document.querySelector('[data-testid=theme]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'dark'); s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await h.waitFor(`matchMedia('(prefers-color-scheme: dark)').matches`, 'dark theme applied to the window')
  h.assert(JSON.parse(readFileSync(file, 'utf8')).desktop.theme.value === 'dark', 'theme persisted')
  await h.shot('settings-dark.png')

  // validation: out-of-range value is rejected, file unchanged, error toast shown
  await commit(h, 'stats-interval', '1')
  await h.waitFor(`/between 2 and 300/.test(document.body.innerText)`, 'validation error toast')
  h.assert(JSON.parse(readFileSync(file, 'utf8')).containers.statsIntervalSeconds.value === 10, 'invalid value not stored')

  // valid interval changes the polling cadence of the stats stream
  await commit(h, 'stats-interval', '3')
  await h.waitFor(`/Settings saved/.test(document.body.innerText)`, 'saved toast')
  await h.ev(`(()=>{window.__t=[]; window.__sub=window.desktopIpcClient.systemResources.openStatsStream().subscribe({next:m=>{ if(m.type==='CHUNK_STATS') window.__t.push(m.payload.cumulatedStatsChunk.timestamp)}}); return 1})()`)
  await h.waitFor(`window.__t.length>=3`, 'three chunks at the new interval', 20000)
  const t = await h.ev(`window.__t`)
  const gap = (t[2] - t[1]) / 1000
  h.assert(gap > 2 && gap < 5, `stats cadence follows setting (3s): gap ${gap.toFixed(1)}s`)
  await h.ev(`window.__sub.unsubscribe()`)
  // restore the default interval for the next checks
  await h.ev(`window.desktopIpcClient.updateSettings({containers:{statsIntervalSeconds:{value:10}}, desktop:{theme:{value:'system'}}})`)
}
export const reset = () => existsSync(file) && rmSync(file)
