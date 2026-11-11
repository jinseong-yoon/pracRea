// Single list of IPC endpoints. Both preload (builds the client) and main (registers handlers)
// walk this table, so channel names are derived from the API path, e.g. "containers.dockerListContainers".
//   simple -> ipcRenderer.invoke("<path>__wrapped") answers { result } or { error }
//   stream -> MessageChannel: renderer posts port2 on channel "<path>", main talks back on that port
export type EndpointKind = 'simple' | 'stream'

export const MANIFEST = {
  engine: { getEngineStatus: 'simple', dockerStreamEvents: 'stream' },
  containers: {
    dockerListContainers: 'simple',
    dockerInspectContainer: 'simple',
    dockerStartContainer: 'simple',
    dockerStopContainer: 'simple',
    dockerRestartContainer: 'simple',
    dockerRemoveContainer: 'simple',
    containersBulkAction: 'simple',
    dockerRunContainer: 'simple',
    openContainerLogsStream: 'stream',
    containerExec: 'stream'
  },
  images: {
    dockerListImages: 'simple',
    dockerRemoveImage: 'simple',
    dockerPruneImages: 'simple',
    dockerPullImage: 'stream'
  },
  volumes: { listWithSizes: 'simple', create: 'simple', remove: 'simple', prune: 'simple' },
  systemResources: { openStatsStream: 'stream' },
  getSettings: 'simple',
  updateSettings: 'simple'
} as const

export interface Endpoint {
  path: string
  kind: EndpointKind
}

export function flatten(node: Record<string, unknown> = MANIFEST, prefix = ''): Endpoint[] {
  const out: Endpoint[] = []
  for (const [k, v] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out.push({ path, kind: v as EndpointKind })
    else out.push(...flatten(v as Record<string, unknown>, path))
  }
  return out
}
