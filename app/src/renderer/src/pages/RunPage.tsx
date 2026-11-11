import { useState, type ReactNode } from 'react'
import { actions, useAppDispatch } from '../store'
import { fetchContainers } from '../store/slices'
import { Icon } from '../components/ui'

interface Pair {
  a: string
  b: string
}
const sameImage = (tag: string, wanted: string): boolean => {
  const norm = (s: string): string => (/[:@]/.test(s.split('/').pop() ?? '') ? s : `${s}:latest`)
  return norm(tag) === norm(wanted)
}

function PairRows(props: {
  title: string
  aPlaceholder: string
  bPlaceholder: string
  rows: Pair[]
  onChange: (r: Pair[]) => void
  testId: string
}): ReactNode {
  const { rows, onChange } = props
  return (
    <fieldset data-testid={props.testId}>
      <legend>{props.title}</legend>
      {rows.map((r, i) => (
        <div className="row" key={i}>
          <input type="text" placeholder={props.aPlaceholder} value={r.a} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} />
          <span>{props.testId === 'env' ? '=' : '→'}</span>
          <input type="text" placeholder={props.bPlaceholder} value={r.b} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, b: e.target.value } : x)))} />
          <button className="icon" title="Remove row" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            <Icon name="trash" />
          </button>
        </div>
      ))}
      <button onClick={() => onChange([...rows, { a: '', b: '' }])}>
        <Icon name="plus" /> Add
      </button>
    </fieldset>
  )
}

export function RunPage({ image: initialImage }: { image?: string }): ReactNode {
  const dispatch = useAppDispatch()
  const [image, setImage] = useState(initialImage ?? '')
  const [name, setName] = useState('')
  const [ports, setPorts] = useState<Pair[]>([])
  const [env, setEnv] = useState<Pair[]>([])
  const [vols, setVols] = useState<Pair[]>([])
  const [phase, setPhase] = useState<'idle' | 'pulling' | 'starting'>('idle')
  const [progress, setProgress] = useState<{ percent: number; status: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const api = window.desktopIpcClient

  const pull = (img: string): Promise<void> =>
    new Promise((resolve, reject) => {
      setPhase('pulling')
      setProgress({ percent: 0, status: 'Starting pull…' })
      api.images.dockerPullImage({ image: img }).subscribe({
        next: (p) => setProgress(p),
        error: (e) => reject(new Error(e.message)),
        complete: () => resolve()
      })
    })

  const submit = async (): Promise<void> => {
    setError(null)
    const img = image.trim()
    if (!img) return setError('Enter an image name, e.g. nginx:alpine')
    try {
      const local = await api.images.dockerListImages()
      if (!local.some((i) => i.tags.some((t) => sameImage(t, img)))) await pull(img)
      setPhase('starting')
      const { id } = await api.containers.dockerRunContainer({
        image: img,
        name,
        ports: ports.filter((p) => p.b.trim()).map((p) => ({ host: p.a, container: p.b })),
        env: env.filter((e) => e.a.trim()).map((e) => ({ key: e.a, value: e.b })),
        volumes: vols.map((v) => ({ host: v.a, container: v.b }))
      })
      await dispatch(fetchContainers())
      dispatch(actions.toast.push('info', `Started ${name || id.slice(0, 12)}`))
      dispatch(actions.nav.navigate({ name: 'container', id, tab: 'logs' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
    }
  }

  const busy = phase !== 'idle'
  return (
    <>
      <div className="page-head">
        <button onClick={() => dispatch(actions.nav.navigate({ name: 'containers' }))}>← Containers</button>
        <h1>Run a container</h1>
      </div>
      <div className="form">
        <fieldset>
          <legend>Image</legend>
          <div className="row">
            <input type="text" data-testid="image-input" placeholder="nginx:alpine" value={image} disabled={busy} onChange={(e) => setImage(e.target.value)} />
          </div>
          <div className="muted">Pulled automatically when it is not available locally.</div>
          {phase === 'pulling' && progress && (
            <div data-testid="pull-progress" style={{ marginTop: 8 }}>
              <div className="progress">
                <div style={{ width: `${progress.percent}%` }} />
              </div>
              <div className="muted">
                {progress.percent}% — {progress.status}
              </div>
            </div>
          )}
        </fieldset>
        <fieldset>
          <legend>Name</legend>
          <div className="row">
            <input type="text" data-testid="name-input" placeholder="(optional) random name when empty" value={name} disabled={busy} onChange={(e) => setName(e.target.value)} />
          </div>
        </fieldset>
        <PairRows testId="ports" title="Ports (host → container; empty host port = random)" aPlaceholder="host, e.g. 8080" bPlaceholder="container, e.g. 80" rows={ports} onChange={setPorts} />
        <PairRows testId="env" title="Environment variables" aPlaceholder="KEY" bPlaceholder="value" rows={env} onChange={setEnv} />
        <PairRows testId="volumes" title="Volumes (host path or volume name → container path)" aPlaceholder="host path / volume" bPlaceholder="/data" rows={vols} onChange={setVols} />
        {error && (
          <div className="notice" data-testid="run-error" style={{ margin: 0 }}>
            {error}
          </div>
        )}
        <div>
          <button className="primary" data-testid="run-submit" disabled={busy} onClick={() => void submit()}>
            {phase === 'pulling' ? 'Pulling…' : phase === 'starting' ? 'Starting…' : 'Run'}
          </button>
        </div>
      </div>
    </>
  )
}
