import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { actions, useAppDispatch } from '../store'
import { Confirm, Icon, formatBytes, useAction } from '../components/ui'
import type { VolumeSummary } from '../../../shared/types'

export function VolumesPage(): ReactNode {
  const dispatch = useAppDispatch()
  const run = useAction()
  const [vols, setVols] = useState<VolumeSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [del, setDel] = useState<VolumeSummary | null>(null)
  const [prune, setPrune] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const load = useCallback(async () => {
    try {
      setVols(await window.desktopIpcClient.volumes.listWithSizes())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const rows = [...(vols ?? [])].sort((a, b) => a.name.localeCompare(b.name))
  return (
    <>
      <div className="page-head">
        <h1>Volumes</h1>
        <span className="muted">{rows.length} volume{rows.length === 1 ? '' : 's'}</span>
        <button className="primary" onClick={() => setCreating(true)}>
          <Icon name="plus" /> Create
        </button>
        <button onClick={() => setPrune(true)}>Prune…</button>
        <button className="icon" title="Refresh" onClick={() => void load()}>
          <Icon name="refresh" />
        </button>
      </div>
      {error && <div className="notice">{error}</div>}
      <div className="card table-wrap">
        {vols === null ? (
          <div className="empty">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="empty">No volumes.</div>
        ) : (
          <table className="grid" data-testid="volume-grid">
            <thead>
              <tr>
                <th>Name</th>
                <th>Driver</th>
                <th>Status</th>
                <th>Created</th>
                <th className="num">Size</th>
                <th className="pin">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.name} data-name={v.name}>
                  <td>{v.name}</td>
                  <td>{v.driver}</td>
                  <td>{v.refCount ? <span className="badge">In use ({v.refCount})</span> : <span className="muted">Unused</span>}</td>
                  <td>{v.createdAt ? new Date(v.createdAt).toISOString().slice(0, 10) : '—'}</td>
                  <td className="num" data-testid="vol-size">
                    {formatBytes(v.size)}
                  </td>
                  <td className="pin">
                    <button className="icon danger" title="Delete" onClick={() => setDel(v)}>
                      <Icon name="trash" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && (
        <Confirm
          title="Create volume"
          confirmLabel="Create"
          body={
            <input type="text" data-testid="vol-name" autoFocus style={{ width: '100%' }} placeholder="volume name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          }
          onCancel={() => setCreating(false)}
          onConfirm={() => {
            const name = newName
            void run(() => window.desktopIpcClient.volumes.create(name), `Volume ${name} created`).then((ok) => {
              if (ok) {
                setCreating(false)
                setNewName('')
              }
              void load()
            })
          }}
        />
      )}
      {del && (
        <Confirm
          title={`Delete volume ${del.name}?`}
          danger
          confirmLabel="Delete"
          body={<p>The data in the volume is lost.{del.refCount ? ` It is in use by ${del.refCount} container(s); the engine will refuse.` : ''}</p>}
          onCancel={() => setDel(null)}
          onConfirm={() => {
            const target = del
            setDel(null)
            void run(() => window.desktopIpcClient.volumes.remove(target.name), 'Volume removed').then(load)
          }}
        />
      )}
      {prune && (
        <Confirm
          title="Prune volumes"
          danger
          confirmLabel="Prune"
          body={<p>Removes unused anonymous volumes (the engine keeps named volumes unless they were created anonymous).</p>}
          onCancel={() => setPrune(false)}
          onConfirm={() => {
            setPrune(false)
            void run(async () => {
              const r = await window.desktopIpcClient.volumes.prune()
              dispatch(actions.toast.push('info', `Pruned ${r.deleted} volume(s), reclaimed ${formatBytes(r.spaceReclaimed)}`))
            }).then(load)
          }}
        />
      )}
    </>
  )
}
