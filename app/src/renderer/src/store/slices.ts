import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type {
  ContainerSummary,
  CumulatedPoint,
  EngineStatus,
  Settings,
  StatsMessage,
  StatsPoint
} from '../../../shared/types'

const api = (): Window['desktopIpcClient'] => window.desktopIpcClient

/* ---------------- navigation ---------------- */
export type Route =
  | { name: 'containers' }
  | { name: 'container'; id: string; tab: 'logs' | 'inspect' | 'stats' | 'exec' }
  | { name: 'run'; image?: string }
  | { name: 'images' }
  | { name: 'volumes' }
  | { name: 'settings' }

export const navSlice = createSlice({
  name: 'nav',
  initialState: { route: { name: 'containers' } as Route },
  reducers: {
    navigate(state, a: PayloadAction<Route>) {
      state.route = a.payload
    }
  }
})

/* ---------------- toasts ---------------- */
export interface Toast {
  id: number
  kind: 'info' | 'error'
  text: string
}
let toastSeq = 1
export const toastSlice = createSlice({
  name: 'toasts',
  initialState: [] as Toast[],
  reducers: {
    push: {
      reducer: (s, a: PayloadAction<Toast>) => {
        s.push(a.payload)
      },
      prepare: (kind: Toast['kind'], text: string) => ({ payload: { id: toastSeq++, kind, text } })
    },
    dismiss: (s, a: PayloadAction<number>) => s.filter((t) => t.id !== a.payload)
  }
})

/* ---------------- engine ---------------- */
export const fetchEngineStatus = createAsyncThunk('engine/status', () => api().engine.getEngineStatus())
export const engineSlice = createSlice({
  name: 'engine',
  initialState: { status: null as EngineStatus | null, checking: true },
  reducers: {},
  extraReducers: (b) => {
    b.addCase(fetchEngineStatus.pending, (s) => {
      s.checking = true
    })
    b.addCase(fetchEngineStatus.fulfilled, (s, a) => {
      s.status = a.payload
      s.checking = false
    })
    b.addCase(fetchEngineStatus.rejected, (s, a) => {
      s.status = { connected: false, error: a.error.message }
      s.checking = false
    })
  }
})

/* ---------------- containers ---------------- */
export type SortKey = 'name' | 'image' | 'cpu' | 'memory' | 'started' | 'status'
export type StateFilter = 'all' | 'running' | 'stopped'

export const fetchContainers = createAsyncThunk('containers/fetch', () =>
  api().containers.dockerListContainers()
)

export const containersSlice = createSlice({
  name: 'containers',
  initialState: {
    items: [] as ContainerSummary[],
    loaded: false,
    error: null as string | null,
    selected: [] as string[],
    expanded: [] as string[], // compose project names that are expanded
    filter: 'all' as StateFilter,
    search: '',
    sortKey: 'name' as SortKey,
    sortDir: 'asc' as 'asc' | 'desc',
    hiddenColumns: ['memoryPercentage', 'disk', 'network', 'pids'] as string[],
    showLogsSince: {} as Record<string, number> // "Clear" in the log view only moves this marker
  },
  reducers: {
    setFilter: (s, a: PayloadAction<StateFilter>) => {
      s.filter = a.payload
    },
    setSearch: (s, a: PayloadAction<string>) => {
      s.search = a.payload
    },
    setSort(s, a: PayloadAction<SortKey>) {
      if (s.sortKey === a.payload) s.sortDir = s.sortDir === 'asc' ? 'desc' : 'asc'
      else {
        s.sortKey = a.payload
        s.sortDir = 'asc'
      }
    },
    toggleSelected(s, a: PayloadAction<string[]>) {
      const all = a.payload.every((id) => s.selected.includes(id))
      s.selected = all
        ? s.selected.filter((id) => !a.payload.includes(id))
        : Array.from(new Set([...s.selected, ...a.payload]))
    },
    clearSelected: (s) => {
      s.selected = []
    },
    toggleExpanded(s, a: PayloadAction<string>) {
      s.expanded = s.expanded.includes(a.payload)
        ? s.expanded.filter((x) => x !== a.payload)
        : [...s.expanded, a.payload]
    },
    toggleColumn(s, a: PayloadAction<string>) {
      s.hiddenColumns = s.hiddenColumns.includes(a.payload)
        ? s.hiddenColumns.filter((x) => x !== a.payload)
        : [...s.hiddenColumns, a.payload]
    },
    setShowLogsSince(s, a: PayloadAction<{ id: string; date: number }>) {
      s.showLogsSince[a.payload.id] = a.payload.date
    }
  },
  extraReducers: (b) => {
    b.addCase(fetchContainers.fulfilled, (s, a) => {
      s.items = a.payload
      s.loaded = true
      s.error = null
      // forget selections of containers that no longer exist
      const ids = new Set(a.payload.map((c) => c.id))
      s.selected = s.selected.filter((id) => ids.has(id))
    })
    b.addCase(fetchContainers.rejected, (s, a) => {
      s.error = a.error.message ?? 'Failed to list containers'
      s.loaded = true
    })
  }
})

/* ---------------- stats ---------------- */
const RETENTION_MS = 60 * 60 * 1000
export const statsSlice = createSlice({
  name: 'stats',
  initialState: {
    status: 'loading' as 'loading' | 'active' | 'error',
    error: null as string | null,
    byContainer: {} as Record<string, StatsPoint[]>,
    cumulated: [] as CumulatedPoint[]
  },
  reducers: {
    message(s, a: PayloadAction<StatsMessage>) {
      const m = a.payload
      if (m.type === 'INITIAL_STATS') {
        s.byContainer = m.payload.initialStatsByContainer
        s.cumulated = m.payload.initialCumulatedStats
        s.status = 'active'
        s.error = null
      } else if (m.type === 'CHUNK_STATS') {
        const now = m.payload.cumulatedStatsChunk.timestamp
        for (const [id, p] of Object.entries(m.payload.statsChunk))
          (s.byContainer[id] ??= []).push(p)
        for (const id of Object.keys(s.byContainer)) {
          s.byContainer[id] = s.byContainer[id].filter((p) => now - p.timestamp <= RETENTION_MS)
          if (!s.byContainer[id].length) delete s.byContainer[id]
        }
        s.cumulated.push(m.payload.cumulatedStatsChunk)
        s.cumulated = s.cumulated.filter((p) => now - p.timestamp <= RETENTION_MS)
        s.status = 'active'
        s.error = null
      } else {
        s.status = 'error'
        s.error = m.payload.error
      }
    },
    reset: (s) => {
      s.status = 'loading'
    }
  }
})

/* ---------------- settings ---------------- */
export const fetchSettings = createAsyncThunk('settings/get', () => api().getSettings())
export const saveSettings = createAsyncThunk(
  'settings/update',
  (patch: Parameters<Window['desktopIpcClient']['updateSettings']>[0]) => api().updateSettings(patch)
)
export const settingsSlice = createSlice({
  name: 'settings',
  initialState: { value: null as Settings | null },
  reducers: {},
  extraReducers: (b) => {
    b.addCase(fetchSettings.fulfilled, (s, a) => {
      s.value = a.payload
    })
    b.addCase(saveSettings.fulfilled, (s, a) => {
      s.value = a.payload
    })
  }
})
