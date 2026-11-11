import { useEffect, useState, type ReactNode } from 'react'
import { actions, useAppDispatch, useAppSelector } from '../store'
import { fetchContainers } from '../store/slices'
import { Confirm, Icon, useAction } from '../components/ui'
import { StatsPanel } from '../components/StatsPanel'
import { InspectView, LogsView } from '../components/LogsView'
import { ExecTerminal } from '../components/ExecTerminal'

type Tab = 'logs' | 'inspect' | 'stats' | 'exec'
const TABS: { id: Tab; label: string }[] = [
  { id: 'logs', label: 'Logs' },
  { id: 'inspect', label: 'Inspect' },
  { id: 'stats', label: 'Stats' },
  { id: 'exec', label: 'Exec' }
]

export function ContainerDetail({ id, tab }: { id: string; tab: Tab }): ReactNode {
  const dispatch = useAppDispatch()
  const c = useAppSelector((s) => s.containers.items.find((x) => x.id === id))
  const loaded = useAppSelector((s) => s.containers.loaded)
  const run = useAction()
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!c && loaded) dispatch(actions.nav.navigate({ name: 'containers' })) // it was deleted
  }, [c, loaded, dispatch])

  if (!c) return <div className="empty">Loading…</div>
  const running = c.state === 'running'
  const act = (fn: () => Promise<void>): void => {
    void run(fn).then(() => dispatch(fetchContainers()))
  }
  const api = window.desktopIpcClient.containers

  return (
    <>
      <div className="page-head">
        <button onClick={() => dispatch(actions.nav.navigate({ name: 'containers' }))}>← Containers</button>
        <h1>
          <span className={`dot ${running ? 'run' : ''}`} /> {c.name}
        </h1>
        <span className="badge">{c.status}</span>
        <span className="muted mono">{c.image}</span>
        {running ? (
          <button onClick={() => act(() => api.dockerStopContainer(c.id))}>
            <Icon name="stop" /> Stop
          </button>
        ) : (
          <button onClick={() => act(() => api.dockerStartContainer(c.id))}>
            <Icon name="play" /> Start
          </button>
        )}
        <button onClick={() => act(() => api.dockerRestartContainer(c.id))}>
          <Icon name="restart" /> Restart
        </button>
        <button className="danger" onClick={() => setConfirmDelete(true)}>
          <Icon name="trash" /> Delete
        </button>
      </div>
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            data-testid={`tab-${t.id}`}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => dispatch(actions.nav.navigate({ name: 'container', id, tab: t.id }))}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'stats' &&
        (running ? <StatsPanel containerId={id} /> : <div className="empty card">Container is not running.</div>)}
      {tab === 'logs' && <LogsView containerId={id} />}
      {tab === 'inspect' && <InspectView containerId={id} />}
      {tab === 'exec' &&
        (running ? <ExecTerminal containerId={id} /> : <div className="empty card">Container is not running.</div>)}
      {confirmDelete && (
        <Confirm
          title={`Delete ${c.name}?`}
          danger
          confirmLabel="Delete"
          body={<p>The container is force-removed. This cannot be undone.</p>}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false)
            act(() => api.dockerRemoveContainer(c.id))
          }}
        />
      )}
    </>
  )
}
