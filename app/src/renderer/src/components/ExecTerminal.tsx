import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { ExecInput } from '../../../shared/types'

/** Interactive shell in a running container: xterm.js on the renderer side, a TTY exec session on the engine side. */
export function ExecTerminal({ containerId }: { containerId: string }): ReactNode {
  const host = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState(0) // bump to reconnect

  useEffect(() => {
    if (!host.current) return
    setStatus('connecting')
    setError(null)
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'Consolas, "Cascadia Mono", monospace',
      fontSize: 13,
      theme: { background: '#0b1217' }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host.current)
    fit.fit()

    const sub = window.desktopIpcClient.containers.containerExec({ containerId }).subscribe({
      next: (data: string) => {
        setStatus('open')
        term.write(data)
      },
      error: (e) => {
        setError(e.message)
        setStatus('closed')
      },
      complete: () => setStatus('closed')
    })
    const send = (m: ExecInput): void => sub.send?.(m)
    // keystrokes -> engine, both directions share one MessageChannel
    const onData = term.onData((d) => send({ type: 'input', data: d }))
    // window / pane size -> pty size
    const pushSize = (): void => {
      try {
        fit.fit()
      } catch {
        return
      }
      send({ type: 'resize', cols: term.cols, rows: term.rows })
    }
    const ro = new ResizeObserver(pushSize)
    ro.observe(host.current)
    const first = setTimeout(pushSize, 150) // after the exec session exists
    term.focus()
    ;(window as unknown as { __term?: Terminal }).__term = term // handle for the smoke test

    return () => {
      clearTimeout(first)
      ro.disconnect()
      onData.dispose()
      sub.unsubscribe()
      term.dispose()
    }
  }, [containerId, session])

  return (
    <>
      <div className="toolbar">
        <span className="badge" data-testid="exec-status">
          {status}
        </span>
        {status === 'closed' && <button onClick={() => setSession((s) => s + 1)}>Reconnect</button>}
        <span className="muted">Starts bash if the image has it, otherwise sh.</span>
      </div>
      {error && <div className="notice">Exec failed: {error}</div>}
      <div className="terminal-host" ref={host} data-testid="terminal" />
    </>
  )
}
