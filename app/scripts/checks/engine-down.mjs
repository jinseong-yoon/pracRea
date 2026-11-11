// Run with DOCKER_HOST=tcp://127.0.0.1:1 so the engine is unreachable.
export default async (h) => {
  await h.waitFor(`!!document.querySelector('[data-testid=engine-down]')`, 'engine-down notice')
  const t = await h.text('[data-testid=engine-down]')
  h.assert(/Cannot reach the container engine/.test(t) && /Retry now/.test(t), 'guidance shown when engine unreachable')
  h.assert((await h.text('[data-testid=engine-pill]')).includes('unreachable'), 'sidebar pill says unreachable')
  await h.shot('engine-down.png')
}
