// Feature 1: sidebar + engine connection state.
export default async (h) => {
  await h.waitFor(`document.querySelector('[data-testid=engine-pill]')?.innerText.includes('Engine ')`, 'engine pill shows version')
  const labels = await h.ev(`[...document.querySelectorAll('.nav-item')].map(e=>e.innerText.trim())`)
  h.assert(JSON.stringify(labels) === JSON.stringify(['Containers', 'Images', 'Volumes', 'Settings']), 'sidebar has Containers/Images/Volumes/Settings: ' + labels)
  h.assert(!(await h.ev(`!!document.querySelector('[data-testid=engine-down]')`)), 'no engine-down notice while engine is reachable')
  // the preload exposed the client and the unwrap-or-throw pattern works end to end
  h.assert((await h.ev(`typeof window.desktopIpcClient?.containers?.dockerListContainers`)) === 'function', 'desktopIpcClient exposed by preload')
  const err = await h.ev(`window.desktopIpcClient.volumes.create('').then(()=> 'no error', e=>e.message)`)
  h.assert(/required/i.test(err), 'engine-side error is thrown in renderer: ' + err)
  // engine failure screen: simulate by rendering the notice through a failed status check
  await h.shot('layout.png')
}
