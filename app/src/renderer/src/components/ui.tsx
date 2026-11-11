import { useEffect, useState, type ReactNode } from 'react'
import { actions, useAppDispatch, useAppSelector } from '../store'

// Own, minimal icon set (24x24 stroke icons).
const paths: Record<string, string> = {
  box: 'M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  disk: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  gear: 'M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM19 12l2-1-1-3-2 .5-1.5-1.5L17 5l-3-1-1 2h-2L10 4 7 5l.5 2L6 8.5 4 8l-1 3 2 1v2l-2 1 1 3 2-.5L7.5 19 7 21l3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3-2-1z',
  play: 'M7 4l13 8-13 8z',
  stop: 'M6 6h12v12H6z',
  restart: 'M4 12a8 8 0 1114 5M4 4v6h6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  plus: 'M12 5v14M5 12h14',
  chevronR: 'M9 6l6 6-6 6',
  chevronD: 'M6 9l6 6 6-6',
  refresh: 'M20 12a8 8 0 11-3-6.2M20 4v5h-5'
}
export function Icon({ name }: { name: keyof typeof paths }): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  )
}

export function BrandMark(): ReactNode {
  return (
    <svg viewBox="0 0 32 32">
      <rect x="1" y="1" width="30" height="30" rx="7" fill="#0e7490" />
      <g fill="#fff">
        <rect x="6" y="15" width="6" height="6" rx="1" />
        <rect x="13" y="15" width="6" height="6" rx="1" />
        <rect x="20" y="15" width="6" height="6" rx="1" />
        <rect x="6" y="22" width="6" height="5" rx="1" />
        <rect x="13" y="22" width="6" height="5" rx="1" />
        <rect x="13" y="8" width="6" height="6" rx="1" />
      </g>
    </svg>
  )
}

export function Toasts(): ReactNode {
  const toasts = useAppSelector((s) => s.toasts)
  const dispatch = useAppDispatch()
  useEffect(() => {
    if (!toasts.length) return
    const t = setTimeout(() => dispatch(actions.toast.dismiss(toasts[0].id)), toasts[0].kind === 'error' ? 8000 : 3500)
    return () => clearTimeout(t)
  }, [toasts, dispatch])
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span style={{ flex: 1 }}>{t.text}</span>
          <button className="link" onClick={() => dispatch(actions.toast.dismiss(t.id))}>
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

export function Confirm(props: {
  title: string
  body: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}): ReactNode {
  return (
    <div className="modal-back" onClick={props.onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <h3>{props.title}</h3>
        <div>{props.body}</div>
        <div className="actions">
          <button onClick={props.onCancel}>Cancel</button>
          <button className={props.danger ? 'primary danger' : 'primary'} onClick={props.onConfirm}>
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Runs an async action, shows a toast on failure. */
export function useAction(): (fn: () => Promise<unknown>, okText?: string) => Promise<boolean> {
  const dispatch = useAppDispatch()
  return async (fn, okText) => {
    try {
      await fn()
      if (okText) dispatch(actions.toast.push('info', okText))
      return true
    } catch (e) {
      dispatch(actions.toast.push('error', e instanceof Error ? e.message : String(e)))
      return false
    }
  }
}

export function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export const formatBytes = (n: number | null | undefined): string => {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  const u = ['KiB', 'MiB', 'GiB', 'TiB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${u[i]}`
}

export const relativeTime = (t: number | null, now = Date.now()): string => {
  if (!t) return '—'
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}
