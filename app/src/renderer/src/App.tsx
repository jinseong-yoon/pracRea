import { useEffect, useRef, type ReactNode } from 'react'
import { actions, useAppDispatch, useAppSelector } from './store'
import { fetchEngineStatus, fetchSettings, type Route } from './store/slices'
import { BrandMark, Icon, Toasts } from './components/ui'
import { ContainersPage } from './pages/ContainersPage'
import { ContainerDetail } from './pages/ContainerDetail'
import { RunPage } from './pages/RunPage'
import { SettingsPage } from './pages/SettingsPage'
import { ImagesPage } from './pages/ImagesPage'
import { VolumesPage } from './pages/VolumesPage'
import { fetchContainers } from './store/slices'

const NAV: { name: Route['name']; label: string; icon: 'box' | 'layers' | 'disk' | 'gear' }[] = [
  { name: 'containers', label: 'Containers', icon: 'box' },
  { name: 'images', label: 'Images', icon: 'layers' },
  { name: 'volumes', label: 'Volumes', icon: 'disk' },
  { name: 'settings', label: 'Settings', icon: 'gear' }
]

function EngineDown({ error }: { error?: string }): ReactNode {
  const dispatch = useAppDispatch()
  const checking = useAppSelector((s) => s.engine.checking)
  return (
    <div className="notice" data-testid="engine-down">
      <h2>Cannot reach the container engine</h2>
      <p>BoxDesk talks to the Docker Engine through its local API. Nothing can be listed or started until the connection works.</p>
      <ol>
        <li>Start Docker Desktop (or your Docker daemon) and wait until it reports that the engine is running.</li>
        <li>
          Check that <code>docker version</code> works in a terminal.
        </li>
        <li>
          If you use a non-default socket, set the <code>DOCKER_HOST</code> environment variable and restart BoxDesk.
        </li>
      </ol>
      {error && (
        <p className="muted mono" style={{ wordBreak: 'break-all' }}>
          {error}
        </p>
      )}
      <button className="primary" disabled={checking} onClick={() => dispatch(fetchEngineStatus())}>
        {checking ? 'Checking…' : 'Retry now'}
      </button>
      <span className="muted"> — retrying automatically every 5 seconds.</span>
    </div>
  )
}

function Page({ route }: { route: Route }): ReactNode {
  switch (route.name) {
    case 'containers':
      return <ContainersPage />
    case 'container':
      return <ContainerDetail id={route.id} tab={route.tab} />
    case 'run':
      return <RunPage image={route.image} />
    case 'images':
      return <ImagesPage />
    case 'volumes':
      return <VolumesPage />
    case 'settings':
      return <SettingsPage />
  }
}

export default function App(): ReactNode {
  const dispatch = useAppDispatch()
  const route = useAppSelector((s) => s.nav.route)
  const engine = useAppSelector((s) => s.engine)

  useEffect(() => {
    void dispatch(fetchSettings())
    void dispatch(fetchEngineStatus())
    const t = setInterval(() => void dispatch(fetchEngineStatus()), 5000)
    return () => clearInterval(t)
  }, [dispatch])

  const connected = engine.status?.connected === true

  // Apply the "show stopped containers" setting once, when settings first arrive (it sets the initial filter).
  const showStopped = useAppSelector((s) => s.settings.value?.desktop.showStoppedContainers.value)
  const appliedInitialFilter = useRef(false)
  useEffect(() => {
    if (showStopped === undefined || appliedInitialFilter.current) return
    appliedInitialFilter.current = true
    if (!showStopped) dispatch(actions.containers.setFilter('running'))
  }, [showStopped, dispatch])

  // Live updates: engine events (via MessageChannel stream) trigger a debounced list refresh.
  useEffect(() => {
    if (!connected) return
    void dispatch(fetchContainers())
    let timer: ReturnType<typeof setTimeout> | undefined
    const sub = window.desktopIpcClient.engine.dockerStreamEvents().subscribe({
      next: (e) => {
        if (e.type !== 'container') return
        clearTimeout(timer)
        timer = setTimeout(() => void dispatch(fetchContainers()), 250)
      },
      error: (err) => dispatch(actions.toast.push('error', `Event stream: ${err.message}`))
    })
    return () => {
      clearTimeout(timer)
      sub.unsubscribe()
    }
  }, [connected, dispatch])

  // Stats: INITIAL/CHUNK/ERROR messages from the main process go straight into the store.
  useEffect(() => {
    if (!connected) return
    dispatch(actions.stats.reset())
    const sub = window.desktopIpcClient.systemResources.openStatsStream().subscribe({
      next: (m) => dispatch(actions.stats.message(m)),
      error: (err) => dispatch(actions.stats.message({ type: 'ERROR_STATS', payload: { error: err.message } }))
    })
    return () => sub.unsubscribe()
  }, [connected, dispatch])

  const activeNav = route.name === 'container' || route.name === 'run' ? 'containers' : route.name

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">
          <BrandMark /> BoxDesk
        </div>
        {NAV.map((n) => (
          <button
            key={n.name}
            data-testid={`nav-${n.name}`}
            className={`nav-item ${activeNav === n.name ? 'active' : ''}`}
            onClick={() => dispatch(actions.nav.navigate({ name: n.name } as Route))}
          >
            <Icon name={n.icon} /> {n.label}
          </button>
        ))}
        <div className="spacer" />
        <div className="engine-pill" data-testid="engine-pill">
          <span className={`dot ${engine.status ? (connected ? 'ok' : 'bad') : ''}`} />
          {engine.status === null
            ? 'Connecting…'
            : connected
              ? `Engine ${engine.status.version}`
              : 'Engine unreachable'}
        </div>
      </nav>
      <main className="content">
        {engine.status === null ? (
          <div className="empty">Connecting to the engine…</div>
        ) : !connected ? (
          <EngineDown error={engine.status.error} />
        ) : (
          <Page route={route} />
        )}
      </main>
      <Toasts />
    </div>
  )
}
