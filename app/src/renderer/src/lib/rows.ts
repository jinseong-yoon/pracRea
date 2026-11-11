// Turns the flat container list into the tree shown in the grid:
// containers sharing a compose project label are grouped under a project row whose
// resource numbers are the sum of its children.
import type { ContainerSummary, StatsPoint } from '../../../shared/types'
import type { SortKey, StateFilter } from '../store/slices'

export const COMPOSE_PROJECT = 'com.docker.compose.project'
export const COMPOSE_SERVICE = 'com.docker.compose.service'

export interface Row {
  kind: 'project' | 'container'
  key: string // unique row key
  ids: string[] // container ids this row stands for (1 for a container)
  name: string
  image: string
  ports: string
  state: string // running | exited | ... | "partial" for projects
  status: string
  cpu: number
  memUsage: number
  memLimit: number
  memPct: number
  blockRead: number
  blockWrite: number
  netRead: number
  netWrite: number
  pids: number
  hasStats: boolean
  startedAt: number | null
  children?: Row[]
}

export function formatPorts(c: ContainerSummary): string {
  const seen = new Set<string>()
  for (const p of c.ports) {
    // the engine lists each published port once for IPv4 and once for IPv6: keep one
    seen.add(p.publicPort ? `${p.publicPort}:${p.privatePort}/${p.type}` : `${p.privatePort}/${p.type}`)
  }
  return [...seen].join(', ')
}

const latest = (stats: Record<string, StatsPoint[]>, id: string): StatsPoint | undefined => {
  const s = stats[id]
  return s && s[s.length - 1]
}

function containerRow(c: ContainerSummary, stats: Record<string, StatsPoint[]>): Row {
  const p = c.state === 'running' ? latest(stats, c.id) : undefined
  return {
    kind: 'container',
    key: c.id,
    ids: [c.id],
    name: c.name,
    image: c.image,
    ports: formatPorts(c),
    state: c.state,
    status: c.status,
    cpu: p?.cpuPercentage ?? 0,
    memUsage: p?.memoryUsageBytes ?? 0,
    memLimit: p?.memoryLimitBytes ?? 0,
    memPct: p?.memoryPercentage ?? 0,
    blockRead: p?.blockIOReadBytes ?? 0,
    blockWrite: p?.blockIOWriteBytes ?? 0,
    netRead: p?.networkIOReadBytes ?? 0,
    netWrite: p?.networkIOWriteBytes ?? 0,
    pids: p?.pids ?? 0,
    hasStats: !!p,
    startedAt: c.startedAt
  }
}

const round2 = (n: number): number => Math.round(n * 100) / 100

function projectRow(name: string, children: Row[]): Row {
  const sum = (f: (r: Row) => number): number => children.reduce((a, r) => a + f(r), 0)
  const running = children.filter((c) => c.state === 'running').length
  const started = children.map((c) => c.startedAt ?? 0).reduce((a, b) => Math.max(a, b), 0)
  return {
    kind: 'project',
    key: `project:${name}`,
    ids: children.flatMap((c) => c.ids),
    name,
    image: `${children.length} container${children.length === 1 ? '' : 's'}`,
    ports: '',
    state: running === children.length ? 'running' : running === 0 ? 'exited' : 'partial',
    status: `${running}/${children.length} running`,
    cpu: round2(sum((r) => r.cpu)),
    memUsage: sum((r) => r.memUsage),
    memLimit: sum((r) => r.memLimit),
    memPct: round2(sum((r) => r.memPct)),
    blockRead: sum((r) => r.blockRead),
    blockWrite: sum((r) => r.blockWrite),
    netRead: sum((r) => r.netRead),
    netWrite: sum((r) => r.netWrite),
    pids: sum((r) => r.pids),
    hasStats: children.some((c) => c.hasStats),
    startedAt: started || null,
    children
  }
}

const matchesState = (state: string, f: StateFilter): boolean =>
  f === 'all' || (f === 'running' ? state === 'running' : state !== 'running')

const sortValue = (r: Row, key: SortKey): string | number => {
  switch (key) {
    case 'name':
      return r.name.toLowerCase()
    case 'image':
      return r.image.toLowerCase()
    case 'cpu':
      return r.cpu
    case 'memory':
      return r.memUsage
    case 'started':
      return r.startedAt ?? 0
    case 'status':
      return r.state
  }
}

export function sortRows(rows: Row[], key: SortKey, dir: 'asc' | 'desc'): Row[] {
  const m = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = sortValue(a, key)
    const y = sortValue(b, key)
    return (x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name)) * m
  })
}

export interface BuildOptions {
  stats: Record<string, StatsPoint[]>
  filter: StateFilter
  search: string
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
}

export function buildRows(items: ContainerSummary[], o: BuildOptions): Row[] {
  const q = o.search.trim().toLowerCase()
  const visible = items.filter((c) => matchesState(c.state, o.filter))
  const groups = new Map<string, ContainerSummary[]>()
  const top: Row[] = []
  for (const c of visible) {
    const project = c.labels[COMPOSE_PROJECT]
    if (project) groups.set(project, [...(groups.get(project) ?? []), c])
    else top.push(containerRow(c, o.stats))
  }
  const textMatch = (r: Row, extra = ''): boolean =>
    !q || `${r.name} ${r.image} ${extra}`.toLowerCase().includes(q)

  const rows: Row[] = top.filter((r) => textMatch(r))
  for (const [name, members] of groups) {
    const children = members.map((c) => containerRow(c, o.stats))
    const projectMatches = !q || name.toLowerCase().includes(q)
    const kept = projectMatches ? children : children.filter((c) => textMatch(c))
    if (kept.length) {
      // keep the project's totals over the shown children only when filtering by text
      rows.push(projectRow(name, sortRows(kept, o.sortKey, o.sortDir)))
    }
  }
  return sortRows(rows, o.sortKey, o.sortDir)
}
