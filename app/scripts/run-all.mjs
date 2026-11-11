// Runs every smoke check against a real Docker engine.
//   npm run build && node scripts/run-all.mjs
// Creates throw-away fixtures (containers/volumes/images named bxt-*) and removes exactly those afterwards.
// It never uses blanket prune/rm commands; the prune checks carry their own "nothing else is prunable" guards.
import { spawnSync } from 'node:child_process'

const docker = (...a) => spawnSync('docker', a, { encoding: 'utf8' })
const IMG = 'redis:7-alpine' // any small locally available image works
const sleepCmd = ['sleep', '3000']

function cleanup() {
  for (const n of ['bxt-solo', 'bxt-web', 'bxt-db', 'bxt-log', 'bxt-run', 'bxt-anon']) docker('rm', '-f', '-v', n)
  for (const v of ['bxt-runvol', 'bxt-vol1']) docker('volume', 'rm', v)
  for (const i of ['bxt-del:1', 'bxt-dang:1', 'busybox:1.36']) docker('rmi', i)
}
function fixtures() {
  cleanup()
  const proj = (n) => ['--label', 'com.docker.compose.project=bxtproj', '--label', `com.docker.compose.service=${n}`]
  docker('run', '-d', '--name', 'bxt-solo', IMG, ...sleepCmd)
  docker('run', '-d', '--name', 'bxt-web', ...proj('web'), IMG, ...sleepCmd)
  docker('run', '-d', '--name', 'bxt-db', ...proj('db'), IMG, ...sleepCmd)
  docker('run', '-d', '--name', 'bxt-log', IMG, 'sh', '-c', 'i=0; while true; do echo out $i; echo err $i >&2; i=$((i+1)); sleep 1; done')
}

const checks = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['layout', 'containers', 'stats', 'logs', 'exec', 'run', 'images-volumes', 'settings', 'settings-persist']
let failed = 0
try {
  // engine-down needs an unreachable engine instead of fixtures
  const down = spawnSync('node', ['scripts/smoke.mjs', 'engine-down'], { env: { ...process.env, DOCKER_HOST: 'tcp://127.0.0.1:1' }, encoding: 'utf8' })
  console.log(down.stdout.trim().split('\n').slice(-1)[0] || down.stderr.trim())
  if (down.status) failed++
  for (const c of checks) {
    if (c === 'containers' || c === 'stats' || c === 'logs' || c === 'exec' || c === 'layout') {
      // (re)create fixtures: `containers` stops two of them, so each check starts from a clean state
      fixtures()
      await new Promise((r) => setTimeout(r, 5000))
    }
    if (c === 'run' || c === 'images-volumes') {
      if (docker('ps', '-q', '-f', 'name=bxt-solo').stdout.trim() === '') fixtures()
      docker('rm', '-f', '-v', 'bxt-run')
      docker('volume', 'rm', 'bxt-runvol')
    }
    const r = spawnSync('node', ['scripts/smoke.mjs', c], { encoding: 'utf8' })
    const last = r.stdout.trim().split('\n').slice(-1)[0] || r.stderr.trim()
    console.log(r.status === 0 ? 'PASS' : 'FAIL', c, '-', last)
    if (r.status) {
      failed++
      console.log(r.stdout.split('\n').slice(-6).join('\n'), r.stderr.slice(-400))
    }
  }
} finally {
  cleanup()
}
process.exit(failed ? 1 : 0)
