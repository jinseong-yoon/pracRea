// Feature 3: stats from `docker stats` CLI parsed in main, delivered via INITIAL/CHUNK messages.
import { execFileSync } from 'node:child_process'

export default async (h) => {
  // Collect raw stream messages independently of the UI, to see the message protocol.
  await h.ev(`(()=>{ window.__msgs=[]; window.__sub = window.desktopIpcClient.systemResources.openStatsStream().subscribe({next:m=>window.__msgs.push(m)}); return true })()`)
  await h.waitFor(`window.__msgs.some(m=>m.type==='CHUNK_STATS')`, 'CHUNK_STATS message', 40000)
  const types = await h.ev(`window.__msgs.map(m=>m.type)`)
  h.assert(types[0] === 'INITIAL_STATS', 'first message is INITIAL_STATS: ' + types.join(','))
  const chunk = await h.ev(`window.__msgs.find(m=>m.type==='CHUNK_STATS').payload`)

  const solo = Object.values(chunk.statsChunk).find((p) => p.name === 'bxt-solo')
  h.assert(!!solo, 'bxt-solo present in chunk')
  // Compare against the CLI directly (parsing correctness): limits are stable, usage roughly equal.
  const cli = JSON.parse(execFileSync('docker', ['stats', '--no-stream', '--no-trunc', '--format', 'json', 'bxt-solo']).toString().trim().split('\n')[0])
  const [usageStr, limitStr] = cli.MemUsage.split(' / ')
  const toBytes = (s) => { const m = /([\d.]+)\s*(\w+)/.exec(s); const u = { B: 1, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3 }[m[2]]; return Math.round(parseFloat(m[1]) * u) }
  h.assert(Math.abs(solo.memoryLimitBytes - toBytes(limitStr)) / toBytes(limitStr) < 0.01, `memory limit parsed: ${solo.memoryLimitBytes} vs CLI "${limitStr}"`)
  h.assert(Math.abs(solo.memoryUsageBytes - toBytes(usageStr)) < 4 * 1024 * 1024, `memory usage parsed: ${solo.memoryUsageBytes} vs CLI "${usageStr}"`)
  h.assert(typeof solo.cpuPercentage === 'number' && solo.pids >= 1 && solo.networkIOReadBytes >= 0, 'cpu/pids/net numeric')
  h.assert(chunk.cumulatedStatsChunk.memoryUsageBytes >= solo.memoryUsageBytes, 'cumulated total covers all running containers')
  h.assert(!Object.values(chunk.statsChunk).some((p) => /^csknow-/.test(p.name)), 'stopped containers produce no samples')

  // second chunk after the polling interval (setting = 10s)
  await h.waitFor(`window.__msgs.filter(m=>m.type==='CHUNK_STATS').length>=2`, 'second CHUNK after interval', 30000)
  await h.ev(`window.__sub.unsubscribe()`)

  // UI: columns filled, chart rendered in the detail Stats tab
  await h.waitFor(`document.querySelector('[data-name=bxt-solo]')?.innerText.includes(' / ')`, 'memory usage/limit shown in grid')
  await h.waitFor(`!!document.querySelector('[data-testid=totals]')`, 'totals strip')
  await h.ev(`document.querySelector('[data-name=bxt-solo] .link').click()`)
  await h.click('[data-testid=tab-stats]')
  await h.waitFor(`document.querySelectorAll('[data-testid=stats-summary]').length===1 && document.querySelectorAll('.chart-box canvas').length===4`, 'four charts drawn')
  await h.shot('stats.png')
}
