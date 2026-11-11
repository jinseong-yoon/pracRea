import { useEffect, type ReactNode } from 'react'
import { actions, useAppDispatch, useAppSelector } from './store'
import { fetchEngineStatus, fetchSettings, type Route } from './store/slices'
import { BrandMark, Icon, Toasts } from './components/ui'
import { Stub } from './pages/Stub'

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
      return <Stub title="Containers" />
    case 'container':
      return <Stub title="Container details" />
    case 'run':
      return <Stub title="Run a container" />
    case 'images':
      return <Stub title="Images" />
    case 'volumes':
      return <Stub title="Volumes" />
    case 'settings':
      return <Stub title="Settings" />
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
