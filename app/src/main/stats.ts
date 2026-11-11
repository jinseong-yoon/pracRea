// Container resource stats. Like the original app, the main process does not compute CPU/memory
// percentages itself: it polls the Docker CLI (`docker stats --no-stream`) and parses its text output.
import { execFile } from 'child_process'
import type { StreamHandler } from './ipc'
import { getSettings, onSettingsChanged } from './settings'
import type { CumulatedPoint, StatsMessage, StatsPoint } from '../shared/types'

const RETENTION_MS = 60 * 60 * 1000
const EXEC_TIMEOUT_MS = 5000

const UNITS: Record<string, number> = {
  b: 1,
  kb: 1e3,
  mb: 1e6,
  gb: 1e9,
  tb: 1e12,
  kib: 1024,
  mib: 1024 ** 2,
  gib: 1024 ** 3,
  tib: 1024 ** 4
}

/** "12.5MiB" -> bytes. "--" or garbage -> 0. */
export function parseBytes(s: string): number {
  const m = /^\s*([\d.]+)\s*([a-zA-Z]*)\s*$/.exec(s)
  if (!m) return 0
  const unit = UNITS[(m[2] || 'b').toLowerCase()]
  return unit ? Math.round(parseFloat(m[1]) * unit) : 0
}
/** "1.5kB / 3MB" -> [1500, 3000000] */
export function parsePair(s: string): [number, number] {
  const [a = '', b = ''] = (s ?? '').split('/')
  return [parseBytes(a), parseBytes(b)]
}
/** "12.34%" -> 12.34 ; "--" -> 0 */
export function parsePercent(s: string): number {
  const n = parseFloat((s ?? '').replace('%', ''))
  return Number.isFinite(n) ? n : 0
}
const round2 = (n: number): number => Math.round(n * 100) / 100

interface CliRow {
  ID: string
  Name: string
  CPUPerc: string
  MemPerc: string
  MemUsage: string
  BlockIO: string
  NetIO: string
  PIDs: string
}

export function parseStatsOutput(stdout: string, timestamp: number): StatsPoint[] {
  const points: StatsPoint[] = []
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue
    let r: CliRow
    try {
      r = JSON.parse(line)
    } catch (e) {
      throw new Error(`Cannot parse docker stats line: ${line.slice(0, 120)} (${e})`)
    }
    // A stopped container is reported with "0B / 0B" memory and 0 (or "--") PIDs: no sample for it.
    if (r.MemUsage?.startsWith('0B / 0B') && (r.PIDs === '0' || r.PIDs === '--')) continue
    const [mem, memLimit] = parsePair(r.MemUsage)
    const [bRead, bWrite] = parsePair(r.BlockIO)
    const [nRead, nWrite] = parsePair(r.NetIO)
    points.push({
      id: r.ID,
      name: r.Name,
      timestamp,
      cpuPercentage: parsePercent(r.CPUPerc),
      memoryPercentage: parsePercent(r.MemPerc),
      memoryUsageBytes: mem,
      memoryLimitBytes: memLimit,
      blockIOReadBytes: bRead,
      blockIOWriteBytes: bWrite,
      networkIOReadBytes: nRead,
      networkIOWriteBytes: nWrite,
      pids: parseInt(r.PIDs, 10) || 0
    })
  }
  return points
}

function runDockerStats(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'docker',
      ['stats', '--all', '--no-trunc', '--no-stream', '--format', 'json'],
      { timeout: EXEC_TIMEOUT_MS, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => (err ? reject(new Error(stderr?.trim() || err.message)) : resolve(stdout))
    )
  })
}

/** Keeps the time series (1h) per container plus the cumulated totals, and polls while someone listens. */
class StatsService {
  byContainer: Record<string, StatsPoint[]> = {}
  cumulated: CumulatedPoint[] = []
  private subscribers = new Set<(m: StatsMessage) => void>()
  private timer: NodeJS.Timeout | null = null
  private busy = false

  constructor() {
    onSettingsChanged(() => {
      if (this.timer) this.schedule()
    })
  }

  private intervalMs(): number {
    return getSettings().containers.statsIntervalSeconds.value * 1000
  }
  private schedule(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = setInterval(() => void this.poll(), this.intervalMs())
  }

  private drop(now: number): void {
    for (const id of Object.keys(this.byContainer)) {
      const kept = this.byContainer[id].filter((p) => now - p.timestamp <= RETENTION_MS)
      if (kept.length) this.byContainer[id] = kept
      else delete this.byContainer[id]
    }
    this.cumulated = this.cumulated.filter((p) => now - p.timestamp <= RETENTION_MS)
  }

  async poll(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      const now = Date.now()
      const rows = parseStatsOutput(await runDockerStats(), now)
      const chunk: Record<string, StatsPoint> = {}
      for (const r of rows) {
        chunk[r.id] = r
        ;(this.byContainer[r.id] ??= []).push(r)
      }
      const total: CumulatedPoint = rows.reduce(
        (a, r) => ({
          timestamp: now,
          cpuPercentage: round2(a.cpuPercentage + r.cpuPercentage),
          memoryUsageBytes: a.memoryUsageBytes + r.memoryUsageBytes,
          memoryLimitBytes: a.memoryLimitBytes + r.memoryLimitBytes
        }),
        { timestamp: now, cpuPercentage: 0, memoryUsageBytes: 0, memoryLimitBytes: 0 }
      )
      this.cumulated.push(total)
      this.drop(now)
      this.emit({ type: 'CHUNK_STATS', payload: { statsChunk: chunk, cumulatedStatsChunk: total } })
    } catch (e) {
      this.emit({ type: 'ERROR_STATS', payload: { error: e instanceof Error ? e.message : String(e) } })
    } finally {
      this.busy = false
    }
  }

  private emit(m: StatsMessage): void {
    this.subscribers.forEach((cb) => cb(m))
  }

  subscribe(cb: (m: StatsMessage) => void): () => void {
    this.subscribers.add(cb)
    cb({
      type: 'INITIAL_STATS',
      payload: { initialStatsByContainer: this.byContainer, initialCumulatedStats: this.cumulated }
    })
    if (this.subscribers.size === 1) {
      this.schedule()
      void this.poll()
    } else if (!Object.keys(this.byContainer).length) void this.poll()
    return () => {
      this.subscribers.delete(cb)
      if (!this.subscribers.size && this.timer) {
        clearInterval(this.timer)
        this.timer = null
      }
    }
  }
}

export const statsService = new StatsService()

export const statsStream: StreamHandler = (_args, ctx) => statsService.subscribe((m) => ctx.next(m))
