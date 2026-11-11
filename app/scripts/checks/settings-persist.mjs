// Run after `settings`: a fresh launch must read the JSON file written by the previous run.
export default async (h) => {
  await h.waitFor(`!!document.querySelector('[data-testid=container-grid]')`, 'app ready')
  const s = await h.ev(`window.desktopIpcClient.getSettings()`)
  h.assert(s.containers.logTailLines.value === 50, 'logTailLines=50 survived an app restart')
  await h.ev(`window.desktopIpcClient.updateSettings({containers:{logTailLines:{value:200}}})`) // restore default
}
