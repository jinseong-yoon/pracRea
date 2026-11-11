import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { actions, useAppDispatch, useAppSelector } from '../store'
import type { LogEvent } from '../../../shared/types'

const MAX_LINES = 5000
// per-service colours (hashed so a service keeps its colour)
const PALETTE = ['#f472b6', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#fb923c', '#22d3ee', '#f87171']
const colorFor = (service: string): string => {
  let h = 0
  for (const ch of service) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}
const p2 = (n: number): string => String(n).padStart(2, '0')
const stamp = (t: number): string => {
  const d = new Date(t)
  return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

// Content shown for a line. Events from the engine stream are mapped to { content, service, timestamp }.
interface Line {
  n: number
  content: string
  service: string
  timestamp: number // engine timestamp, or arrival time when the engine gave none
  stream: 'stdout' | 'stderr'
}

export function LogsView({ containerId }: { containerId: string }): ReactNode {
  const dispatch = useAppDispatch()
  const since = useAppSelector((s) => s.containers.showLogsSince[containerId] ?? 0)
  const tail = useAppSelector((s) => s.settings.value?.containers.logTailLines.value ?? 200)
  const [lines, setLines] = useState<Line[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ended, setEnded] = useState(false)
  const [follow, setFollow] = useState(true)
  const box = useRef<HTMLDivElement>(null)
  const seq = useRef(0)

  useEffect(() => {
    setLines([])
    setError(null)
    setEnded(false)
    const sub = window.desktopIpcClient.containers.openContainerLogsStream({ containerId, tail }).subscribe({
      next: (e: LogEvent) => {
        const line: Line = {
          n: seq.current++,
          content: e.line,
          service: e.service,
          timestamp: e.timestamp ?? Date.now(),
          stream: e.stream
        }
        setLines((prev) => (prev.length >= MAX_LINES ? [...prev.slice(prev.length - MAX_LINES + 1), line] : [...prev, line]))
      },
      error: (err) => setError(err.message),
      complete: () => setEnded(true)
    })
    return () => sub.unsubscribe()
  }, [containerId, tail])

  // "Clear" never touches the engine: it only moves the showLogsSince marker.
  const shown = useMemo(() => lines.filter((l) => l.timestamp > since), [lines, since])

  useEffect(() => {
    if (follow && box.current) box.current.scrollTop = box.current.scrollHeight
  }, [shown, follow])

  return (
    <>
      <div className="toolbar">
        <button data-testid="clear-logs" onClick={() => dispatch(actions.containers.setShowLogsSince({ id: containerId, date: Date.now() }))}>
          Clear
        </button>
        <label>
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow
        </label>
        {since > 0 && (
          <button className="link" onClick={() => dispatch(actions.containers.setShowLogsSince({ id: containerId, date: 0 }))}>
            show cleared lines
          </button>
        )}
        <span className="muted" data-testid="log-count">
          {shown.length} line{shown.length === 1 ? '' : 's'}
          {ended ? ' · stream ended (container stopped)' : ''}
        </span>
      </div>
      {error && <div className="notice">Log stream failed: {error}</div>}
      <div className="logbox" ref={box} data-testid="logbox">
        {shown.map((l) => (
          <div key={l.n} className={`logline ${l.stream}`}>
            <span className="ts">{stamp(l.timestamp)}</span>
            <span className="svc" style={{ color: colorFor(l.service) }}>
              {l.service}
            </span>
            <span className="msg">{l.content}</span>
          </div>
        ))}
        {!shown.length && !error && <span className="muted">No log output.</span>}
      </div>
    </>
  )
}

export function InspectView({ containerId }: { containerId: string }): ReactNode {
  const [data, setData] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setData(null)
    window.desktopIpcClient.containers.dockerInspectContainer(containerId).then(setData, (e) => setError(e.message))
  }, [containerId])
  if (error) return <div className="notice">Inspect failed: {error}</div>
  if (!data) return <div className="empty">Loading…</div>
  return (
    <div className="json" data-testid="inspect-json">
      {JSON.stringify(data, null, 2)}
    </div>
  )
}
