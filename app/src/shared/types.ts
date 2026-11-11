// Types shared by main, preload and renderer.

export interface EngineStatus {
  connected: boolean
  version?: string
  ncpu?: number
  memTotal?: number
  error?: string
}

export interface PortInfo {
  ip?: string
  privatePort: number
  publicPort?: number
  type: string
}

export interface ContainerSummary {
  id: string
  name: string
  image: string
  imageId: string
  state: string // running | exited | paused | created | restarting | dead
  status: string // human text from the engine, e.g. "Up 3 hours"
  ports: PortInfo[]
  labels: Record<string, string>
  createdAt: number // epoch ms
  startedAt: number | null // epoch ms, null if never started
}

export interface StatsPoint {
  id: string
  name: string
  timestamp: number
  cpuPercentage: number
  memoryPercentage: number
  memoryUsageBytes: number
  memoryLimitBytes: number
  blockIOReadBytes: number
  blockIOWriteBytes: number
  networkIOReadBytes: number
  networkIOWriteBytes: number
  pids: number
}

export interface CumulatedPoint {
  timestamp: number
  cpuPercentage: number
  memoryUsageBytes: number
  memoryLimitBytes: number
}

export type StatsMessage =
  | {
      type: 'INITIAL_STATS'
      payload: {
        initialStatsByContainer: Record<string, StatsPoint[]>
        initialCumulatedStats: CumulatedPoint[]
      }
    }
  | {
      type: 'CHUNK_STATS'
      payload: { statsChunk: Record<string, StatsPoint>; cumulatedStatsChunk: CumulatedPoint }
    }
  | { type: 'ERROR_STATS'; payload: { error: string } }

export interface LogEvent {
  line: string
  service: string
  timestamp: number | null
  stream: 'stdout' | 'stderr'
}

export interface EngineEvent {
  type: string // container | image | volume | network ...
  action: string
  id: string
}

export type BulkAction = 'start' | 'stop' | 'restart' | 'remove'
export interface BulkResult {
  id: string
  ok: boolean
  error?: string
}

export interface ImageSummary {
  id: string
  tags: string[]
  createdAt: number
  size: number
  dangling: boolean
}

export interface VolumeSummary {
  name: string
  driver: string
  mountpoint: string
  createdAt: string | null
  size: number | null // bytes, null when the engine did not report it
  refCount: number | null
}

export interface PullProgress {
  percent: number // aggregated over layers, 0..100
  status: string
}

export interface RunOptions {
  image: string
  name?: string
  ports?: { host: string; container: string; protocol?: 'tcp' | 'udp' }[]
  env?: { key: string; value: string }[]
  volumes?: { host: string; container: string }[]
}

export interface PruneResult {
  deleted: number
  spaceReclaimed: number
}

// Settings: every leaf is wrapped as { value } (shape observed in the original app).
export interface Setting<T> {
  value: T
}
export interface Settings {
  desktop: {
    theme: Setting<'system' | 'light' | 'dark'>
    showStoppedContainers: Setting<boolean>
  }
  containers: {
    statsIntervalSeconds: Setting<number>
    logTailLines: Setting<number>
  }
}
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

export interface Subscription {
  unsubscribe(): void
  /** only for bidirectional streams (exec terminal) */
  send?(message: unknown): void
}
export interface Observer<T> {
  next(value: T): void
  error?(err: { message: string }): void
  complete?(): void
}
export interface Stream<T> {
  subscribe(observer: Observer<T>): Subscription
}

export interface ExecInput {
  type: 'input' | 'resize'
  data?: string
  cols?: number
  rows?: number
}

// The API surface exposed to the renderer as `desktopIpcClient`.
export interface DesktopApi {
  engine: {
    getEngineStatus(): Promise<EngineStatus>
    dockerStreamEvents(): Stream<EngineEvent>
  }
  containers: {
    dockerListContainers(): Promise<ContainerSummary[]>
    dockerInspectContainer(id: string): Promise<unknown>
    dockerStartContainer(id: string): Promise<void>
    dockerStopContainer(id: string): Promise<void>
    dockerRestartContainer(id: string): Promise<void>
    dockerRemoveContainer(id: string): Promise<void>
    containersBulkAction(ids: string[], action: BulkAction): Promise<BulkResult[]>
    dockerRunContainer(options: RunOptions): Promise<{ id: string }>
    openContainerLogsStream(args: { containerId: string; tail?: number }): Stream<LogEvent>
    containerExec(args: { containerId: string }): Stream<string>
  }
  images: {
    dockerListImages(): Promise<ImageSummary[]>
    dockerRemoveImage(id: string): Promise<void>
    dockerPruneImages(args: { all: boolean }): Promise<PruneResult>
    dockerPullImage(args: { image: string }): Stream<PullProgress>
  }
  volumes: {
    listWithSizes(): Promise<VolumeSummary[]>
    create(name: string): Promise<void>
    remove(name: string): Promise<void>
    prune(): Promise<PruneResult>
  }
  systemResources: {
    openStatsStream(): Stream<StatsMessage>
  }
  getSettings(): Promise<Settings>
  updateSettings(patch: DeepPartial<Settings>): Promise<Settings>
}
